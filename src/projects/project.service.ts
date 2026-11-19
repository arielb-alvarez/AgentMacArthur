import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import type { ProjectMemberRepository } from "../project-members/project-member.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { RoleAssignmentRepository } from "../role-assignments/role-assignment.repository.js";

import type {
  Project,
  ProjectStatus,
  UpdateProjectInput,
} from "./project.types.js";

type ProjectManagementPermission =
  | "project.update"
  | "project.change_status";

export interface CreateProjectCommand {
  organizationId: string;
  name: string;
  description?: string | null;
}

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
    private readonly organizationPermissionService: OrganizationPermissionService,
    private readonly transactionManager: TransactionManager
  ) {}

  async create(
    userId: string,
    input: CreateProjectCommand
  ): Promise<Project> {
    return this.transactionManager.runInTransaction(
      "createProject",
      async (client) => {
        const organizationMember =
          await this.organizationMemberRepository.findByOrganizationAndUser(
            input.organizationId,
            userId,
            client
          );

        if (
          !organizationMember ||
          organizationMember.status !== "active"
        ) {
          throw this.organizationNotFoundError();
        }

        await this.organizationPermissionService.assertPermission(
          input.organizationId,
          userId,
          "project.create",
          client
        );

        const project = await this.projectRepository.create(
          {
            organizationId: input.organizationId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            createdBy: userId,
          },
          client
        );

        await this.projectMemberRepository.create(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId,
            role: "project_owner",
            status: "active",
          },
          client
        );

        await this.roleAssignmentRepository.assignProjectRole(
          {
            projectId: project.id,
            organizationId: project.organizationId,
            userId,
            roleKey: "project_owner",
            assignedBy: userId,
          },
          client
        );

        return project;
      }
    );
  }

  async list(
    userId: string,
    organizationId?: string
  ): Promise<Project[]> {
    return this.projectRepository.findAccessibleByUserId(
      userId,
      organizationId
    );
  }

  async getById(
    projectId: string,
    userId: string
  ): Promise<Project> {
    return this.transactionManager.runInTransaction(
      "getAccessibleProject",
      async (client) => {
        const project = await this.projectRepository.findById(
          projectId,
          client
        );

        if (!project) {
          throw this.projectNotFoundError();
        }

        await this.assertCanViewProject(project, userId, client);

        return project;
      }
    );
  }

  async update(
    projectId: string,
    userId: string,
    input: UpdateProjectInput
  ): Promise<Project> {
    return this.transactionManager.runInTransaction(
      "updateProject",
      async (client) => {
        const project = await this.projectRepository.findById(
          projectId,
          client
        );

        if (!project) {
          throw this.projectNotFoundError();
        }

        await this.assertCanManageProject(
          project,
          userId,
          "project.update",
          client
        );

        const updatedProject =
          await this.projectRepository.update(
            project.id,
            project.organizationId,
            input,
            client
          );

        if (!updatedProject) {
          throw this.projectNotFoundError();
        }

        return updatedProject;
      }
    );
  }

  async updateStatus(
    projectId: string,
    userId: string,
    status: ProjectStatus
  ): Promise<Project> {
    return this.transactionManager.runInTransaction(
      "updateProjectStatus",
      async (client) => {
        const project = await this.projectRepository.findById(
          projectId,
          client
        );

        if (!project) {
          throw this.projectNotFoundError();
        }

        await this.assertCanManageProject(
          project,
          userId,
          "project.change_status",
          client
        );

        const updatedProject =
          await this.projectRepository.updateStatus(
            project.id,
            project.organizationId,
            { status },
            client
          );

        if (!updatedProject) {
          throw this.projectNotFoundError();
        }

        return updatedProject;
      }
    );
  }

  private async assertCanViewProject(
    project: Project,
    userId: string,
    client: import("pg").PoolClient
  ): Promise<void> {
    await this.assertActiveOrganizationMembership(
      project.organizationId,
      userId,
      client
    );

    const canViewOrganizationProjects =
      await this.organizationPermissionService.hasPermission(
        project.organizationId,
        userId,
        "organization.projects.view",
        client
      );

    if (canViewOrganizationProjects) {
      return;
    }

    const canViewProject =
      await this.organizationPermissionService.hasProjectPermission(
        project.organizationId,
        project.id,
        userId,
        "project.view",
        client
      );

    if (!canViewProject) {
      throw this.projectNotFoundError();
    }
  }

  private async assertCanManageProject(
    project: Project,
    userId: string,
    permission: ProjectManagementPermission,
    client: import("pg").PoolClient
  ): Promise<void> {
    await this.assertActiveOrganizationMembership(
      project.organizationId,
      userId,
      client
    );

    const canManageOrganizationProjects =
      await this.organizationPermissionService.hasPermission(
        project.organizationId,
        userId,
        "organization.projects.manage",
        client
      );

    if (canManageOrganizationProjects) {
      return;
    }

    const canManageProject =
      await this.organizationPermissionService.hasProjectPermission(
        project.organizationId,
        project.id,
        userId,
        permission,
        client
      );

    if (!canManageProject) {
      throw new AppError(
        "You do not have permission to perform this action on the project.",
        403
      );
    }
  }

  private async assertActiveOrganizationMembership(
    organizationId: string,
    userId: string,
    client: import("pg").PoolClient
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

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }

  private projectNotFoundError(): AppError {
    return new AppError(
      "Project not found or you do not have access.",
      404
    );
  }
}
