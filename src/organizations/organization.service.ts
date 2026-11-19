import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";
import type { UserRepository } from "../users/user.repository.js";
import type { Organization } from "./organization.types.js";
import type { OrganizationRepository } from "./organization.repository.js";
import type { UpdateOrganizationInput } from "./organization.types.js";

export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly organizationPermissionService: OrganizationPermissionService,
    private readonly userRepository: UserRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  async list(userId: string): Promise<Organization[]> {
    return this.organizationRepository.findByUserId(userId);
  }

  async getById(
    organizationId: string,
    userId: string
  ): Promise<Organization> {
    return this.transactionManager.runInTransaction(
      "getAccessibleOrganization",
      async (client) => {
        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        await this.assertCanViewOrganization(
          organizationId,
          userId,
          client
        );

        return organization;
      }
    );
  }

  async update(
    organizationId: string,
    userId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    return this.transactionManager.runInTransaction(
      "updateOrganization",
      async (client) => {
        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        const member =
          await this.organizationMemberRepository.findByOrganizationAndUser(
            organizationId,
            userId,
            client
          );

        if (!member || member.status !== "active") {
          throw this.organizationNotFoundError();
        }

        await this.organizationPermissionService.assertPermission(
          organizationId,
          userId,
          "organization.update",
          client
        );

        const updatedOrganization =
          await this.organizationRepository.update(
            organizationId,
            input,
            client
          );

        if (!updatedOrganization) {
          throw this.organizationNotFoundError();
        }

        return updatedOrganization;
      }
    );
  }

  async transferOwnership(
    organizationId: string,
    requesterUserId: string,
    targetUserId: string
  ): Promise<Organization> {
    try {
      return await this.transactionManager.runInTransaction(
        "transferOrganizationOwnership",
        async (client) => {
          const organization =
            await this.organizationRepository.findByIdForUpdate(
              organizationId,
              client
            );

          if (!organization) {
            throw this.organizationNotFoundError();
          }

          // Ownership transfer is restricted to the authoritative owner.
          if (organization.ownerUserId !== requesterUserId) {
            throw new AppError(
              "Only the current organization owner can transfer ownership.",
              403
            );
          }

          if (requesterUserId === targetUserId) {
            throw new AppError(
              "You cannot transfer ownership to yourself.",
              409
            );
          }

          const currentOwner =
            await this.organizationMemberRepository.findByOrganizationAndUser(
              organizationId,
              requesterUserId,
              client
            );

          const targetMember =
            await this.organizationMemberRepository.findByOrganizationAndUser(
              organizationId,
              targetUserId,
              client
            );

          if (!currentOwner || currentOwner.status !== "active") {
            throw new AppError(
              "The current owner must have an active organization membership.",
              409
            );
          }

          if (!targetMember || targetMember.status !== "active") {
            throw new AppError(
              "The target user must have an active organization membership.",
              409
            );
          }

          if (currentOwner.role !== "owner") {
            throw new AppError(
              "The current owner's membership role is inconsistent.",
              409
            );
          }

          const targetUser = await this.userRepository.findById(
            targetUserId,
            client
          );

          if (!targetUser) {
            throw new AppError("Target user not found.", 404);
          }

          if (targetUser.status !== "active") {
            throw new AppError(
              "The target user account must be active.",
              409
            );
          }

          const currentOwnerBaseRoles =
            await this.roleAssignmentRepository.findOrganizationBaseRoles(
              organizationId,
              requesterUserId,
              client
            );

          if (
            currentOwnerBaseRoles.length !== 1 ||
            currentOwnerBaseRoles[0] !== "owner"
          ) {
            throw new AppError(
              "The current owner must have exactly one valid owner base role.",
              409
            );
          }

          const targetBaseRoles =
            await this.roleAssignmentRepository.findOrganizationBaseRoles(
              organizationId,
              targetUserId,
              client
            );

          if (
            targetBaseRoles.length !== 1 ||
            (targetBaseRoles[0] !== "admin" &&
              targetBaseRoles[0] !== "member")
          ) {
            throw new AppError(
              "The target member must have exactly one valid non-owner base role.",
              409
            );
          }

          if (targetMember.role !== targetBaseRoles[0]) {
            throw new AppError(
              "The target member's legacy role is inconsistent with its assigned base role.",
              409
            );
          }

          await this.roleAssignmentRepository.replaceOrganizationBaseRole(
            {
              organizationId,
              userId: requesterUserId,
              roleKey: "admin",
              assignedBy: requesterUserId,
            },
            client
          );

          await this.roleAssignmentRepository.replaceOrganizationBaseRole(
            {
              organizationId,
              userId: targetUserId,
              roleKey: "owner",
              assignedBy: requesterUserId,
            },
            client
          );

          const updatedPreviousOwner =
            await this.organizationMemberRepository.updateRole(
              organizationId,
              requesterUserId,
              "admin",
              client
            );

          if (!updatedPreviousOwner) {
            throw new AppError(
              "Could not update the previous owner's membership role.",
              409
            );
          }

          const updatedTargetMember =
            await this.organizationMemberRepository.updateRole(
              organizationId,
              targetUserId,
              "owner",
              client
            );

          if (!updatedTargetMember) {
            throw new AppError(
              "Could not update the target member's membership role.",
              409
            );
          }

          const updatedOrganization =
            await this.organizationRepository.updateOwner(
              organizationId,
              targetUserId,
              client
            );

          if (!updatedOrganization) {
            throw this.organizationNotFoundError();
          }

          return updatedOrganization;
        }
      );
    } catch (error) {
      if (this.isPersonalOrganizationOwnerConflict(error)) {
        throw new AppError(
          "The target user already owns a personal organization and cannot become the owner of this personal organization.",
          409
        );
      }

      throw error;
    }
  }

  private async assertCanViewOrganization(
    organizationId: string,
    userId: string,
    client: PoolClient
  ): Promise<void> {
    const member =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        userId,
        client
      );

    if (!member || member.status !== "active") {
      throw this.organizationNotFoundError();
    }
  }

  private isPersonalOrganizationOwnerConflict(
    error: unknown
  ): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }

    const databaseError = error as {
      code?: string;
      constraint?: string;
    };

    return (
      databaseError.code === "23505" &&
      databaseError.constraint ===
        "idx_organizations_one_personal_per_owner"
    );
  }

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }
}
