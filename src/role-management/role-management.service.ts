import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";
import type { RoleManagementRepository } from "./role-management.repository.js";

import type {
  CreateCustomRoleInput,
  ManagedRole,
  ManagedRoleScope,
  PermissionDefinition,
  UpdateCustomRoleInput,
} from "./role-management.types.js";

export class RoleManagementService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly roleManagementRepository: RoleManagementRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  private async assertCanManageRoles(
    organizationId: string,
    requesterId: string,
    client: PoolClient
  ): Promise<void> {
    const organization = await this.organizationRepository.findById(
      organizationId,
      client
    );

    if (!organization) {
      throw new AppError("Organization not found.", 404);
    }

    const membership =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        requesterId,
        client
      );

    if (!membership || membership.status !== "active") {
      throw new AppError(
        "You do not have permission to manage organization roles.",
        403
      );
    }

    const baseRoles =
      await this.roleAssignmentRepository.findOrganizationBaseRoles(
        organizationId,
        requesterId,
        client
      );

    const isOwner = organization.ownerUserId === requesterId;

    if (isOwner) {
      if (
        membership.role !== "owner" ||
        baseRoles.length !== 1 ||
        baseRoles[0] !== "owner"
      ) {
        throw new AppError(
          "Organization ownership and base-role assignments are inconsistent.",
          409
        );
      }

      return;
    }

    if (
      membership.role !== "admin" ||
      baseRoles.length !== 1 ||
      baseRoles[0] !== "admin"
    ) {
      throw new AppError(
        "Only active organization owners and admins can manage custom roles.",
        403
      );
    }
  }

  private async assertActiveOrganizationMember(
    organizationId: string,
    userId: string,
    client: PoolClient
  ): Promise<void> {
    const membership =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        userId,
        client
      );

    if (!membership || membership.status !== "active") {
      throw new AppError(
        "Target user must have active membership in this organization.",
        404
      );
    }
  }

  private async assertOrganizationCustomRole(
    organizationId: string,
    roleId: string,
    client: PoolClient
  ): Promise<void> {
    const role = await this.roleManagementRepository.findById(
      organizationId,
      roleId,
      client
    );

    if (!role) {
      throw new AppError("Custom role not found.", 404);
    }

    if (role.isSystem || role.scope !== "organization") {
      throw new AppError(
        "Only organization-scoped custom roles can be assigned through this operation.",
        400
      );
    }
  }

  async listRoles(
    organizationId: string,
    requesterId: string,
    scope?: ManagedRoleScope
  ): Promise<ManagedRole[]> {
    return this.transactionManager.runInTransaction(
      "listManagedRoles",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        return this.roleManagementRepository.findAllByOrganizationId(
          organizationId,
          scope,
          client
        );
      }
    );
  }

  async listPermissions(
    organizationId: string,
    requesterId: string,
    scope: ManagedRoleScope
  ): Promise<PermissionDefinition[]> {
    return this.transactionManager.runInTransaction(
      "listManagedRolePermissions",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        return this.roleManagementRepository.findPermissionsByScope(
          scope,
          client
        );
      }
    );
  }

  async createRole(
    organizationId: string,
    requesterId: string,
    input: Omit<CreateCustomRoleInput, "organizationId">
  ): Promise<ManagedRole> {
    return this.transactionManager.runInTransaction(
      "createManagedRole",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        try {
          return await this.roleManagementRepository.createCustomRole(
            {
              ...input,
              organizationId,
            },
            client
          );
        } catch (error) {
          if (this.isPostgresError(error, "23505")) {
            throw new AppError(
              "A custom role with this key already exists in this organization and scope.",
              409
            );
          }

          throw error;
        }
      }
    );
  }

  async updateRole(
    organizationId: string,
    requesterId: string,
    roleId: string,
    input: Pick<UpdateCustomRoleInput, "name"> &
      Partial<Pick<UpdateCustomRoleInput, "description">>
  ): Promise<ManagedRole> {
    return this.transactionManager.runInTransaction(
      "updateManagedRole",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        const updated =
          await this.roleManagementRepository.updateCustomRole(
            {
              organizationId,
              roleId,
              ...input,
            },
            client
          );

        if (!updated) {
          throw new AppError("Custom role not found.", 404);
        }

        return updated;
      }
    );
  }

  async deleteRole(
    organizationId: string,
    requesterId: string,
    roleId: string
  ): Promise<void> {
    return this.transactionManager.runInTransaction(
      "deleteManagedRole",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        const result =
          await this.roleManagementRepository.deleteCustomRole(
            organizationId,
            roleId,
            client
          );

        if (result === "not_found") {
          throw new AppError("Custom role not found.", 404);
        }

        if (result === "assigned") {
          throw new AppError(
            "This custom role cannot be deleted while it is assigned to members.",
            409
          );
        }
      }
    );
  }

  async replacePermissions(
    organizationId: string,
    requesterId: string,
    roleId: string,
    permissionIds: string[]
  ): Promise<void> {
    return this.transactionManager.runInTransaction(
      "replaceManagedRolePermissions",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        try {
          await this.roleManagementRepository.replacePermissions(
            organizationId,
            roleId,
            permissionIds,
            client
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              "Custom role not found in the specified organization."
          ) {
            throw new AppError("Custom role not found.", 404);
          }

          if (
            error instanceof Error &&
            error.message ===
              "One or more permissions do not exist or do not match the custom role scope."
          ) {
            throw new AppError(
              "One or more permissions are invalid for this custom role scope.",
              400
            );
          }

          throw error;
        }
      }
    );
  }

  async assignOrganizationCustomRole(
    organizationId: string,
    requesterId: string,
    userId: string,
    roleId: string
  ): Promise<void> {
    return this.transactionManager.runInTransaction(
      "assignOrganizationCustomRole",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        await this.assertActiveOrganizationMember(
          organizationId,
          userId,
          client
        );

        await this.assertOrganizationCustomRole(
          organizationId,
          roleId,
          client
        );

        await this.roleAssignmentRepository.assignOrganizationCustomRole(
          {
            organizationId,
            userId,
            roleId,
            assignedBy: requesterId,
          },
          client
        );
      }
    );
  }

  async removeOrganizationCustomRole(
    organizationId: string,
    requesterId: string,
    userId: string,
    roleId: string
  ): Promise<void> {
    return this.transactionManager.runInTransaction(
      "removeOrganizationCustomRole",
      async (client) => {
        await this.assertCanManageRoles(
          organizationId,
          requesterId,
          client
        );

        await this.assertActiveOrganizationMember(
          organizationId,
          userId,
          client
        );

        await this.assertOrganizationCustomRole(
          organizationId,
          roleId,
          client
        );

        await this.roleAssignmentRepository.removeOrganizationCustomRole(
          {
            organizationId,
            userId,
            roleId,
            assignedBy: requesterId,
          },
          client
        );
      }
    );
  }

  private isPostgresError(
    error: unknown,
    code: string
  ): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }
}
