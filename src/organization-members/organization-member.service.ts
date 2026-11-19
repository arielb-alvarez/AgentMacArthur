import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import type { UserRepository } from "../users/user.repository.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";
import type { OrganizationMemberRepository } from "./organization-member.repository.js";
import type {
  OrganizationMember,
  OrganizationMemberDetails,
  OrganizationMemberDirectoryEntry,
} from "./organization-member.types.js";

type ManagedMemberRole = "admin" | "member";

export class OrganizationMemberService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly organizationPermissionService: OrganizationPermissionService,
    private readonly userRepository: UserRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  async listMembers(
    organizationId: string,
    requesterUserId: string
  ): Promise<OrganizationMemberDirectoryEntry[]> {
    return this.transactionManager.runInTransaction(
      "listOrganizationMembers",
      async (client) => {
        await this.assertActiveOrganizationMember(
          organizationId,
          requesterUserId,
          client
        );

        await this.organizationPermissionService.assertOrganizationPermission(
          organizationId,
          requesterUserId,
          "organization.members.view",
          client
        );

        return this.organizationMemberRepository.findAllBasicByOrganizationId(
          organizationId,
          client
        );
      }
    );
  }

  async getMember(
    organizationId: string,
    targetUserId: string,
    requesterUserId: string
  ): Promise<OrganizationMemberDetails> {
    return this.transactionManager.runInTransaction(
      "getOrganizationMember",
      async (client) => {
        await this.assertActiveOrganizationMember(
          organizationId,
          requesterUserId,
          client
        );

        await this.organizationPermissionService.assertOrganizationPermission(
          organizationId,
          requesterUserId,
          "organization.members.view_details",
          client
        );

        const member =
          await this.organizationMemberRepository.findDetailsByOrganizationAndUser(
            organizationId,
            targetUserId,
            client
          );

        if (!member) {
          throw this.memberNotFoundError();
        }

        return member;
      }
    );
  }

  async suspendMember(
    organizationId: string,
    targetUserId: string,
    requesterUserId: string
  ): Promise<OrganizationMember> {
    return this.transactionManager.runInTransaction(
      "suspendOrganizationMember",
      async (client) => {
        const organization = await this.lockOrganization(
          organizationId,
          client
        );

        await this.assertActiveOrganizationMember(
          organizationId,
          requesterUserId,
          client
        );

        const isOwner = await this.assertCanManageMembers(
          organization.id,
          organization.ownerUserId,
          requesterUserId,
          client
        );

        const target = await this.getManageableTarget(
          organizationId,
          targetUserId,
          requesterUserId,
          organization.ownerUserId,
          isOwner,
          client
        );

        if (target.status === "suspended") {
          throw this.conflictError(
            "Organization member is already suspended."
          );
        }

        const updated =
          await this.organizationMemberRepository.updateStatus(
            organizationId,
            targetUserId,
            "suspended",
            client
          );

        if (!updated) {
          throw this.memberNotFoundError();
        }

        return updated;
      }
    );
  }

  async reactivateMember(
    organizationId: string,
    targetUserId: string,
    requesterUserId: string
  ): Promise<OrganizationMember> {
    return this.transactionManager.runInTransaction(
      "reactivateOrganizationMember",
      async (client) => {
        const organization = await this.lockOrganization(
          organizationId,
          client
        );

        await this.assertActiveOrganizationMember(
          organizationId,
          requesterUserId,
          client
        );

        const isOwner = await this.assertCanManageMembers(
          organization.id,
          organization.ownerUserId,
          requesterUserId,
          client
        );

        const target = await this.getManageableTarget(
          organizationId,
          targetUserId,
          requesterUserId,
          organization.ownerUserId,
          isOwner,
          client
        );

        if (target.status === "active") {
          throw this.conflictError(
            "Organization member is already active."
          );
        }

        const user = await this.userRepository.findById(
          targetUserId,
          client
        );

        if (!user || user.status !== "active") {
          throw this.conflictError(
            "Only users with an active account can be reactivated."
          );
        }

        const updated =
          await this.organizationMemberRepository.updateStatus(
            organizationId,
            targetUserId,
            "active",
            client
          );

        if (!updated) {
          throw this.memberNotFoundError();
        }

        return updated;
      }
    );
  }

  async changeMemberRole(
    organizationId: string,
    targetUserId: string,
    newRole: ManagedMemberRole,
    requesterUserId: string
  ): Promise<OrganizationMember> {
    return this.transactionManager.runInTransaction(
      "changeOrganizationMemberRole",
      async (client) => {
        const organization = await this.lockOrganization(
          organizationId,
          client
        );

        await this.assertActiveOrganizationMember(
          organizationId,
          requesterUserId,
          client
        );

        const isOwner = await this.assertCanManageMembers(
          organization.id,
          organization.ownerUserId,
          requesterUserId,
          client
        );

        if (!isOwner) {
          throw this.forbiddenError(
            "Only the organization owner can change base member roles."
          );
        }

        if (targetUserId === requesterUserId) {
          throw this.forbiddenError(
            "You cannot change your own base role."
          );
        }

        if (targetUserId === organization.ownerUserId) {
          throw this.forbiddenError(
            "The organization owner's role cannot be changed here."
          );
        }

        const target =
          await this.organizationMemberRepository.findByOrganizationAndUser(
            organizationId,
            targetUserId,
            client
          );

        if (!target) {
          throw this.memberNotFoundError();
        }

        const currentBaseRole = await this.getManagedTargetBaseRole(
          organizationId,
          targetUserId,
          client
        );

        if (currentBaseRole === newRole) {
          throw this.conflictError(
            "Organization member already has that base role."
          );
        }

        await this.roleAssignmentRepository.replaceOrganizationBaseRole(
          {
            organizationId,
            userId: targetUserId,
            roleKey: newRole,
            assignedBy: requesterUserId,
          },
          client
        );

        const updated =
          await this.organizationMemberRepository.updateRole(
            organizationId,
            targetUserId,
            newRole,
            client
          );

        if (!updated) {
          throw this.memberNotFoundError();
        }

        return updated;
      }
    );
  }

  private async lockOrganization(
    organizationId: string,
    client: PoolClient
  ) {
    const organization =
      await this.organizationRepository.findByIdForUpdate(
        organizationId,
        client
      );

    if (!organization) {
      throw this.organizationNotFoundError();
    }

    return organization;
  }

  private async assertCanManageMembers(
    organizationId: string,
    ownerUserId: string,
    requesterUserId: string,
    client: PoolClient
  ): Promise<boolean> {
    await this.organizationPermissionService.assertOrganizationPermission(
      organizationId,
      requesterUserId,
      "organization.members.manage",
      client
    );

    if (requesterUserId === ownerUserId) {
      return true;
    }

    const baseRoles =
      await this.roleAssignmentRepository.findOrganizationBaseRoles(
        organizationId,
        requesterUserId,
        client
      );

    if (!baseRoles.includes("admin")) {
      throw this.forbiddenError(
        "You do not have permission to manage organization members."
      );
    }

    return false;
  }

  private async getManagedTargetBaseRole(
    organizationId: string,
    targetUserId: string,
    client: PoolClient
  ): Promise<ManagedMemberRole> {
    const baseRoles =
      await this.roleAssignmentRepository.findOrganizationBaseRoles(
        organizationId,
        targetUserId,
        client
      );

    if (
      baseRoles.length !== 1 ||
      (baseRoles[0] !== "admin" && baseRoles[0] !== "member")
    ) {
      throw this.conflictError(
        "Organization member must have exactly one valid non-owner base role."
      );
    }

    return baseRoles[0];
  }

  private async getManageableTarget(
    organizationId: string,
    targetUserId: string,
    requesterUserId: string,
    ownerUserId: string,
    requesterIsOwner: boolean,
    client: PoolClient
  ): Promise<OrganizationMember> {
    if (targetUserId === requesterUserId) {
      throw this.forbiddenError(
        "You cannot manage your own membership."
      );
    }

    if (targetUserId === ownerUserId) {
      throw this.forbiddenError(
        "The organization owner cannot be managed through ordinary membership operations."
      );
    }

    const target =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        targetUserId,
        client
      );

    if (!target) {
      throw this.memberNotFoundError();
    }

    const targetBaseRole = await this.getManagedTargetBaseRole(
      organizationId,
      targetUserId,
      client
    );

    if (!requesterIsOwner && targetBaseRole === "admin") {
      throw this.forbiddenError(
        "Administrators cannot manage other administrators."
      );
    }

    return target;
  }

  private async assertActiveOrganizationMember(
    organizationId: string,
    requesterUserId: string,
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

    const membership =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        requesterUserId,
        client
      );

    if (!membership || membership.status !== "active") {
      throw this.organizationNotFoundError();
    }
  }

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }

  private memberNotFoundError(): AppError {
    return new AppError(
      "Organization member not found.",
      404
    );
  }

  private forbiddenError(message: string): AppError {
    return new AppError(message, 403);
  }

  private conflictError(message: string): AppError {
    return new AppError(message, 409);
  }
}
