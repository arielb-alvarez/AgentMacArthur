import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import type { ProjectRepository } from "../projects/project.repository.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";
import type { RoleManagementRepository } from "../role-management/role-management.repository.js";

import type { ProjectMemberRepository } from "./project-member.repository.js";
import type {
  ProjectMember,
  ProjectMemberRole,
  ProjectMemberStatus,
} from "./project-member.types.js";

export type ManageableProjectMemberRole = Exclude<
  ProjectMemberRole,
  "project_owner"
>;

export interface AddProjectMemberCommand {
  userId: string;
  role: ManageableProjectMemberRole;
}

export interface TransferProjectOwnershipCommand {
  newOwnerUserId: string;
}

export class ProjectMemberService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly organizationPermissionService: OrganizationPermissionService,
    private readonly roleManagementRepository: RoleManagementRepository,
    private readonly transactionManager: TransactionManager
  ) { }

  async list(
    projectId: string,
    actorUserId: string
  ): Promise<ProjectMember[]> {
    return this.transactionManager.runInTransaction(
      "listProjectMembers",
      async (client) => {
        const project = await this.projectRepository.findById(
          projectId,
          client
        );

        if (!project) {
          throw this.projectNotFoundError();
        }

        await this.assertCanManageMembers(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        return this.projectMemberRepository.findByProjectId(
          project.id,
          client
        );
      }
    );
  }

  async add(
    projectId: string,
    actorUserId: string,
    input: AddProjectMemberCommand
  ): Promise<ProjectMember> {
    return this.transactionManager.runInTransaction(
      "addProjectMember",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageMembers(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        await this.assertSingleActiveProjectOwner(
          project.id,
          client
        );

        const organizationMember =
          await this.organizationMemberRepository.findByOrganizationAndUser(
            project.organizationId,
            input.userId,
            client
          );

        if (
          !organizationMember ||
          organizationMember.status !== "active"
        ) {
          throw new AppError(
            "The user must have active membership in the project organization.",
            400
          );
        }

        const existingMember =
          await this.projectMemberRepository.findByProjectAndUser(
            project.id,
            input.userId,
            client
          );

        if (existingMember) {
          throw new AppError(
            "The user is already a member of this project.",
            409
          );
        }

        const member = await this.projectMemberRepository.create(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: input.userId,
            role: input.role,
            status: "active",
          },
          client
        );

        await this.roleAssignmentRepository.assignProjectRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: input.userId,
            roleKey: input.role,
            assignedBy: actorUserId,
          },
          client
        );

        return member;
      }
    );
  }

  async updateRole(
    projectId: string,
    actorUserId: string,
    targetUserId: string,
    role: ManageableProjectMemberRole
  ): Promise<ProjectMember> {
    if (actorUserId === targetUserId) {
      throw new AppError(
        "You cannot change your own project role.",
        403
      );
    }

    return this.transactionManager.runInTransaction(
      "updateProjectMemberRole",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageMembers(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        await this.assertSingleActiveProjectOwner(
          project.id,
          client
        );

        const member =
          await this.requireProjectMember(
            project.id,
            targetUserId,
            client
          );

        if (member.role === "project_owner") {
          throw this.ownerProtectedError();
        }

        if (member.role === role) {
          return member;
        }

        await this.roleAssignmentRepository.replaceProjectPrimaryRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: targetUserId,
            roleKey: role,
            assignedBy: actorUserId,
          },
          member.role,
          client
        );

        const updatedMember =
          await this.projectMemberRepository.updateRole(
            project.id,
            targetUserId,
            role,
            client
          );

        if (!updatedMember) {
          throw this.memberNotFoundError();
        }

        return updatedMember;
      }
    );
  }

  async updateStatus(
    projectId: string,
    actorUserId: string,
    targetUserId: string,
    status: ProjectMemberStatus
  ): Promise<ProjectMember> {
    if (actorUserId === targetUserId) {
      throw new AppError(
        "You cannot change your own project membership status.",
        403
      );
    }

    return this.transactionManager.runInTransaction(
      "updateProjectMemberStatus",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageMembers(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        await this.assertSingleActiveProjectOwner(
          project.id,
          client
        );

        const member =
          await this.requireProjectMember(
            project.id,
            targetUserId,
            client
          );

        if (member.role === "project_owner") {
          throw this.ownerProtectedError();
        }

        const updatedMember =
          await this.projectMemberRepository.updateStatus(
            project.id,
            targetUserId,
            status,
            client
          );

        if (!updatedMember) {
          throw this.memberNotFoundError();
        }

        return updatedMember;
      }
    );
  }

  async remove(
    projectId: string,
    actorUserId: string,
    targetUserId: string
  ): Promise<void> {
    if (actorUserId === targetUserId) {
      throw new AppError(
        "You cannot remove yourself from the project.",
        403
      );
    }

    await this.transactionManager.runInTransaction(
      "removeProjectMember",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageMembers(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        await this.assertSingleActiveProjectOwner(
          project.id,
          client
        );

        const member =
          await this.requireProjectMember(
            project.id,
            targetUserId,
            client
          );

        if (member.role === "project_owner") {
          throw this.ownerProtectedError();
        }

        const deleted =
          await this.projectMemberRepository.delete(
            project.id,
            targetUserId,
            client
          );

        if (!deleted) {
          throw this.memberNotFoundError();
        }
      }
    );
  }

  async assignCustomRole(
    projectId: string,
    actorUserId: string,
    targetUserId: string,
    roleId: string
  ): Promise<void> {
    await this.transactionManager.runInTransaction(
      "assignProjectCustomRole",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageCustomRoleAssignments(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        const targetMember = await this.requireProjectMember(
          project.id,
          targetUserId,
          client
        );

        if (targetMember.status !== "active") {
          throw new AppError(
            "Custom roles can only be assigned to active project members.",
            400
          );
        }

        const role = await this.roleManagementRepository.findById(
          project.organizationId,
          roleId,
          client
        );

        if (!role) {
          throw new AppError(
            "Custom role not found.",
            404
          );
        }

        if (role.scope !== "project") {
          throw new AppError(
            "Only project-scoped custom roles can be assigned to project members.",
            400
          );
        }

        await this.roleAssignmentRepository.assignProjectCustomRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: targetUserId,
            roleId: role.id,
            assignedBy: actorUserId,
          },
          client
        );
      }
    );
  }

  async removeCustomRole(
    projectId: string,
    actorUserId: string,
    targetUserId: string,
    roleId: string
  ): Promise<void> {
    await this.transactionManager.runInTransaction(
      "removeProjectCustomRole",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertCanManageCustomRoleAssignments(
          project.organizationId,
          project.id,
          actorUserId,
          client
        );

        const targetMember = await this.requireProjectMember(
          project.id,
          targetUserId,
          client
        );

        if (targetMember.status !== "active") {
          throw new AppError(
            "Custom roles can only be removed from active project members.",
            400
          );
        }

        const role = await this.roleManagementRepository.findById(
          project.organizationId,
          roleId,
          client
        );

        if (!role) {
          throw new AppError(
            "Custom role not found.",
            404
          );
        }

        if (role.scope !== "project") {
          throw new AppError(
            "Only project-scoped custom roles can be removed from project members.",
            400
          );
        }

        await this.roleAssignmentRepository.removeProjectCustomRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: targetUserId,
            roleId: role.id,
          },
          client
        );
      }
    );
  }

  async transferOwnership(
    projectId: string,
    actorUserId: string,
    input: TransferProjectOwnershipCommand
  ): Promise<{
    previousOwner: ProjectMember;
    newOwner: ProjectMember;
  }> {
    if (actorUserId === input.newOwnerUserId) {
      throw new AppError(
        "You are already the project owner.",
        400
      );
    }

    return this.transactionManager.runInTransaction(
      "transferProjectOwnership",
      async (client) => {
        const project = await this.lockProject(projectId, client);

        await this.assertActiveOrganizationMembership(
          project.organizationId,
          actorUserId,
          client
        );

        const owners = await this.assertSingleActiveProjectOwner(
          project.id,
          client
        );

        const currentOwner = owners[0]!;

        if (currentOwner.userId !== actorUserId) {
          throw new AppError(
            "Only the current project owner can transfer ownership.",
            403
          );
        }

        const newOwner = await this.requireProjectMember(
          project.id,
          input.newOwnerUserId,
          client
        );

        if (newOwner.status !== "active") {
          throw new AppError(
            "Ownership can only be transferred to an active project member.",
            400
          );
        }

        await this.assertActiveOrganizationMembership(
          project.organizationId,
          newOwner.userId,
          client
        );

        await this.roleAssignmentRepository.replaceProjectPrimaryRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: currentOwner.userId,
            roleKey: "project_manager",
            assignedBy: actorUserId,
          },
          "project_owner",
          client
        );

        await this.roleAssignmentRepository.replaceProjectPrimaryRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId: newOwner.userId,
            roleKey: "project_owner",
            assignedBy: actorUserId,
          },
          newOwner.role,
          client
        );

        const updatedPreviousOwner =
          await this.projectMemberRepository.updateRole(
            project.id,
            currentOwner.userId,
            "project_manager",
            client
          );

        const updatedNewOwner =
          await this.projectMemberRepository.updateRole(
            project.id,
            newOwner.userId,
            "project_owner",
            client
          );

        if (!updatedPreviousOwner || !updatedNewOwner) {
          throw this.memberNotFoundError();
        }

        return {
          previousOwner: updatedPreviousOwner,
          newOwner: updatedNewOwner,
        };
      }
    );
  }

  private async lockProject(
    projectId: string,
    client: PoolClient
  ) {
    const project = await this.projectRepository.lockById(
      projectId,
      client
    );

    if (!project) {
      throw this.projectNotFoundError();
    }

    return project;
  }

  private async assertCanManageMembers(
    organizationId: string,
    projectId: string,
    userId: string,
    client: PoolClient
  ): Promise<void> {
    await this.assertActiveOrganizationMembership(
      organizationId,
      userId,
      client
    );

    const canManageOrganizationProjects =
      await this.organizationPermissionService.hasPermission(
        organizationId,
        userId,
        "organization.projects.manage",
        client
      );

    if (canManageOrganizationProjects) {
      return;
    }

    const canManageProjectMembers =
      await this.organizationPermissionService.hasProjectPermission(
        organizationId,
        projectId,
        userId,
        "project.members.manage",
        client
      );

    if (!canManageProjectMembers) {
      throw new AppError(
        "You do not have permission to manage project members.",
        403
      );
    }
  }

  private async assertActiveOrganizationMembership(
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
      throw this.projectNotFoundError();
    }
  }

  private async requireProjectMember(
    projectId: string,
    userId: string,
    client: PoolClient
  ): Promise<ProjectMember> {
    const member =
      await this.projectMemberRepository.findByProjectAndUser(
        projectId,
        userId,
        client
      );

    if (!member) {
      throw this.memberNotFoundError();
    }

    return member;
  }

  private async assertSingleActiveProjectOwner(
    projectId: string,
    client: PoolClient
  ): Promise<ProjectMember[]> {
    const members =
      await this.projectMemberRepository.findByProjectId(
        projectId,
        client
      );

    const owners = members.filter(
      (member) => member.role === "project_owner"
    );

    if (
      owners.length !== 1 ||
      owners[0]!.status !== "active"
    ) {
      throw new AppError(
        "The project ownership state is invalid. Exactly one active project owner is required.",
        409
      );
    }

    return owners;
  }

  private async assertCanManageCustomRoleAssignments(
    organizationId: string,
    projectId: string,
    userId: string,
    client: PoolClient
  ): Promise<void> {
    await this.assertActiveOrganizationMembership(
      organizationId,
      userId,
      client
    );

    const actorMember = await this.projectMemberRepository.findByProjectAndUser(
      projectId,
      userId,
      client
    );

    if (!actorMember || actorMember.status !== "active") {
      throw new AppError(
        "You do not have permission to manage project custom-role assignments.",
        403
      );
    }

    if (actorMember.role === "project_owner") {
      return;
    }

    const canManageProjectMembers =
      await this.organizationPermissionService.hasProjectPermission(
        organizationId,
        projectId,
        userId,
        "project.members.manage",
        client
      );

    if (!canManageProjectMembers) {
      throw new AppError(
        "You do not have permission to manage project custom-role assignments.",
        403
      );
    }
  }

  private projectNotFoundError(): AppError {
    return new AppError(
      "Project not found or you do not have access.",
      404
    );
  }

  private memberNotFoundError(): AppError {
    return new AppError(
      "Project member not found.",
      404
    );
  }

  private ownerProtectedError(): AppError {
    return new AppError(
      "The project owner cannot be changed through ordinary membership management. Use the ownership transfer operation.",
      409
    );
  }
}
