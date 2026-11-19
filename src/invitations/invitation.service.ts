import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import type { UserRepository } from "../users/user.repository.js";
import type { EmailService } from "../email/email.service.js";
import type { TokenService } from "../auth/token.service.js";

import type { InvitationRepository } from "./invitation.repository.js";
import type {
  Invitation,
  OrganizationInvitationRole,
} from "./invitation.types.js";

const INVITATION_EXPIRATION_DAYS = 7;
const INVITATION_DELIVERY_STALE_MINUTES = 10;

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const isDuplicatePendingOrganizationInvitation = (
  error: unknown
): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as {
    code?: unknown;
    constraint?: unknown;
  };

  return (
    databaseError.code === "23505" &&
    databaseError.constraint ===
      "idx_invitations_pending_organization_email"
  );
};

export interface CreateOrganizationInvitationInput {
  organizationId: string;
  actorUserId: string;
  email: string;
  roleKey?: OrganizationInvitationRole;
}

export class InvitationService {
  constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly userRepository: UserRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly permissionService: OrganizationPermissionService,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly transactionManager: TransactionManager,
    private readonly frontendUrl: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createInvitation(
    input: CreateOrganizationInvitationInput
  ): Promise<Invitation> {
    const email = input.email.trim().toLowerCase();
    const roleKey = input.roleKey ?? "member";

    if (!email || !email.includes("@")) {
      throw new AppError("A valid invitation email is required.", 400);
    }

    if (roleKey !== "admin" && roleKey !== "member") {
      throw new AppError("Invalid organization invitation role.", 400);
    }

    const generatedToken = this.tokenService.generate();
    const deliveryAttemptId = randomUUID();
    const createdAt = this.now();

    const expiresAt = new Date(
      createdAt.getTime() +
        INVITATION_EXPIRATION_DAYS * MILLISECONDS_PER_DAY
    );

    const result = await this.transactionManager.runInTransaction(
      "createOrganizationInvitation",
      async (client) => {
        await this.assertCanManageInvitations(
          input.organizationId,
          input.actorUserId,
          client
        );

        const organization =
          await this.organizationRepository.findById(
            input.organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        const inviter = await this.userRepository.findById(
          input.actorUserId,
          client
        );

        if (!inviter || inviter.status !== "active") {
          throw new AppError(
            "The inviting account is not available.",
            403
          );
        }

        await this.invitationRepository.lockOrganizationEmail(
          input.organizationId,
          email,
          client
        );

        const existingUser =
          await this.userRepository.findByEmail(email, client);

        if (existingUser) {
          const existingMembership =
            await this.organizationMemberRepository.findByOrganizationAndUser(
              input.organizationId,
              existingUser.id,
              client
            );

          if (existingMembership) {
            throw new AppError(
              "This user is already a member of the organization.",
              409
            );
          }
        }

        await this.invitationRepository
          .expirePendingByOrganizationAndEmail(
            input.organizationId,
            email,
            client
          );

        const invitation = await this.invitationRepository.create(
          {
            organizationId: input.organizationId,
            email,
            roleKey,
            tokenHash: generatedToken.tokenHash,
            invitedBy: input.actorUserId,
            expiresAt,
            emailDeliveryAttemptId: deliveryAttemptId,
            emailDeliveryStartedAt: createdAt,
          },
          client
        );

        return {
          invitation,
          organizationName: organization.name,
          inviterDisplayName: inviter.displayName,
        };
      }
    ).catch((error: unknown) => {
      if (isDuplicatePendingOrganizationInvitation(error)) {
        throw new AppError(
          "A pending invitation already exists for this email address.",
          409
        );
      }

      throw error;
    });

    return this.deliverInvitation(
      result.invitation,
      generatedToken.rawToken,
      result.organizationName,
      result.inviterDisplayName,
      deliveryAttemptId
    );
  }

  async listInvitations(
    organizationId: string,
    actorUserId: string
  ): Promise<Invitation[]> {
    return this.transactionManager.runInTransaction(
      "listOrganizationInvitations",
      async (client) => {
        await this.assertCanManageInvitations(
          organizationId,
          actorUserId,
          client
        );

        return this.invitationRepository.findAllByOrganizationId(
          organizationId,
          client
        );
      }
    );
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string
  ): Promise<Invitation> {
    const generatedToken = this.tokenService.generate();
    const deliveryAttemptId = randomUUID();
    const startedAt = this.now();

    const expiresAt = new Date(
      startedAt.getTime() +
        INVITATION_EXPIRATION_DAYS * MILLISECONDS_PER_DAY
    );

    const staleAttemptBefore = new Date(
      startedAt.getTime() -
        INVITATION_DELIVERY_STALE_MINUTES *
          MILLISECONDS_PER_MINUTE
    );

    const result = await this.transactionManager.runInTransaction(
      "resendOrganizationInvitation",
      async (client) => {
        await this.assertCanManageInvitations(
          organizationId,
          actorUserId,
          client
        );

        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        const invitation =
          await this.invitationRepository.findByIdForOrganization(
            organizationId,
            invitationId,
            client
          );

        if (!invitation || invitation.projectId !== null) {
          throw this.invitationNotFoundError();
        }

        if (invitation.status !== "pending") {
          throw new AppError(
            "Only pending invitations can be resent.",
            409
          );
        }

        if (invitation.expiresAt.getTime() <= startedAt.getTime()) {
          throw new AppError(
            "This invitation has expired and cannot be resent.",
            410
          );
        }

        const inviter = await this.userRepository.findById(
          actorUserId,
          client
        );

        if (!inviter || inviter.status !== "active") {
          throw new AppError(
            "The inviting account is not available.",
            403
          );
        }

        const updatedInvitation =
          await this.invitationRepository.replaceToken(
            {
              organizationId,
              invitationId,
              tokenHash: generatedToken.tokenHash,
              expiresAt,
              emailDeliveryAttemptId: deliveryAttemptId,
              emailDeliveryStartedAt: startedAt,
              staleAttemptBefore,
            },
            client
          );

        if (!updatedInvitation) {
          throw new AppError(
            "An invitation delivery is already in progress, or the invitation can no longer be resent.",
            409
          );
        }

        return {
          invitation: updatedInvitation,
          organizationName: organization.name,
          inviterDisplayName: inviter.displayName,
        };
      }
    );

    return this.deliverInvitation(
      result.invitation,
      generatedToken.rawToken,
      result.organizationName,
      result.inviterDisplayName,
      deliveryAttemptId
    );
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string
  ): Promise<Invitation> {
    return this.transactionManager.runInTransaction(
      "revokeOrganizationInvitation",
      async (client) => {
        await this.assertCanManageInvitations(
          organizationId,
          actorUserId,
          client
        );

        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        const invitation =
          await this.invitationRepository.findByIdForOrganization(
            organizationId,
            invitationId,
            client
          );

        if (!invitation || invitation.projectId !== null) {
          throw this.invitationNotFoundError();
        }

        if (invitation.status !== "pending") {
          throw new AppError(
            "Only pending invitations can be revoked.",
            409
          );
        }

        const revoked = await this.invitationRepository.revoke(
          organizationId,
          invitationId,
          client
        );

        if (!revoked) {
          throw new AppError(
            "The invitation could not be revoked.",
            409
          );
        }

        return revoked;
      }
    );
  }


  async acceptInvitation(
    userId: string,
    rawToken: string
  ): Promise<Invitation> {
    if (!rawToken || !rawToken.trim()) {
        throw new AppError("Invalid or expired invitation.", 400);
    }

    const tokenHash = this.tokenService.hash(rawToken);

    return this.transactionManager.runInTransaction(
      "acceptOrganizationInvitation",
      async (client) => {
        const user = await this.userRepository.findById(
            userId,
            client
        );

        if (
            !user ||
            user.status !== "active" ||
            !user.emailVerifiedAt
        ) {
            throw new AppError(
            "A verified, active account is required to accept an invitation.",
            403
            );
        }

        // Initial lookup: identify the organization and email
        // without acquiring an invitation row lock.
        const initialInvitation =
            await this.invitationRepository.findByTokenHash(
            tokenHash,
            client
            );

        if (
            !initialInvitation ||
            initialInvitation.projectId !== null
        ) {
            throw new AppError(
            "Invalid or expired invitation.",
            400
            );
        }

        // Serialize invitation creation and acceptance for
        // the same organization/email combination.
        await this.invitationRepository.lockOrganizationEmail(
            initialInvitation.organizationId,
            initialInvitation.email,
            client
        );

        // Re-read and lock the invitation after acquiring
        // the organization/email lock.
        const invitation =
            await this.invitationRepository.findByTokenHashForUpdate(
            tokenHash,
            client
            );

        if (!invitation || invitation.projectId !== null) {
            throw new AppError(
            "Invalid or expired invitation.",
            400
            );
        }

        if (invitation.status !== "pending") {
            throw new AppError(
            "This invitation is no longer pending.",
            409
            );
        }

        if (invitation.expiresAt.getTime() <= this.now().getTime()) {
            throw new AppError(
            "This invitation has expired.",
            410
            );
        }

        if (
            user.email.trim().toLowerCase() !==
            invitation.email.trim().toLowerCase()
        ) {
            throw new AppError(
            "This invitation was sent to a different email address.",
            403
            );
        }

        const existingMembership =
            await this.organizationMemberRepository.findByOrganizationAndUser(
            invitation.organizationId,
            userId,
            client
            );

        if (existingMembership) {
            throw new AppError(
            "You are already a member of this organization.",
            409
            );
        }

        if (
            invitation.roleKey !== "admin" &&
            invitation.roleKey !== "member"
        ) {
            throw new AppError(
            "This invitation contains an unsupported role.",
            409
            );
        }

        await this.organizationMemberRepository.create(
            {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.roleKey,
            status: "active",
            },
            client
        );

        await this.roleAssignmentRepository.assignOrganizationRole(
            {
            organizationId: invitation.organizationId,
            userId,
            roleKey: invitation.roleKey,
            assignedBy: invitation.invitedBy,
            },
            client
        );

        const accepted = await this.invitationRepository.markAccepted(
            invitation.id,
            userId,
            client
        );

        if (!accepted) {
            throw new AppError(
            "The invitation could not be accepted.",
            409
            );
        }

        return accepted;
      }
    );
  }

  private async deliverInvitation(
    invitation: Invitation,
    rawToken: string,
    organizationName: string,
    inviterDisplayName: string,
    deliveryAttemptId: string
  ): Promise<Invitation> {
    const invitationUrl =
      `${this.frontendUrl.replace(/\/+$/, "")}` +
      `/accept-invitation#token=${encodeURIComponent(rawToken)}`;

    try {
      await this.emailService.sendInvitationEmail({
        to: invitation.email,
        organizationName,
        inviterDisplayName,
        roleName: invitation.roleName,
        invitationUrl,
        expiresAt: invitation.expiresAt,
      });
    } catch {
      // A provider error does not necessarily mean delivery failed.
      // The result may be unknown because the provider could have
      // accepted the message before the connection failed.
      await this.invitationRepository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: deliveryAttemptId,
        status: "unknown",
        sentAt: null,
      });

      return this.getUpdatedInvitation(invitation);
    }

    // Keep this outside the email-provider catch block.
    // A database failure must not be classified as an email failure.
    //
    // A false result is expected when this attempt was superseded
    // or the invitation became inactive while the email was sending.
    await this.invitationRepository.recordEmailDelivery({
      invitationId: invitation.id,
      emailDeliveryAttemptId: deliveryAttemptId,
      status: "sent",
      sentAt: this.now(),
    });

    return this.getUpdatedInvitation(invitation);
  }

  private async getUpdatedInvitation(
    invitation: Invitation
  ): Promise<Invitation> {
    const updatedInvitation =
      await this.invitationRepository.findByIdForOrganization(
        invitation.organizationId,
        invitation.id
      );

    if (!updatedInvitation) {
      throw new AppError(
        "The invitation could not be retrieved after delivery.",
        500
      );
    }

    return updatedInvitation;
  }

  private async assertCanManageInvitations(
    organizationId: string,
    actorUserId: string,
    client: PoolClient
  ): Promise<void> {
    const organization =
      await this.organizationRepository.findById(
        organizationId,
        client
      );

    if (!organization) {
      throw this.organizationNotFoundError();
    }

    await this.permissionService.assertPermission(
      organizationId,
      actorUserId,
      "organization.members.manage",
      client
    );
  }

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }

  private invitationNotFoundError(): AppError {
    return new AppError("Invitation not found.", 404);
  }
}
