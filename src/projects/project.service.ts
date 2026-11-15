import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { ProjectMemberRepository } from "../project-members/project-member.repository.js";
import type { ProjectRepository } from "./project.repository.js";

import type {
  Project,
  ProjectStatus,
  UpdateProjectInput,
} from "./project.types.js";

import type { ProjectMemberRole } from "../project-members/project-member.types.js";

export interface CreateProjectCommand {
  organizationId: string;
  name: string;
  description?: string | null;
}

const PROJECT_MANAGER_ROLES: ProjectMemberRole[] = [
  "project_owner",
  "project_manager",
];

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
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
          throw new AppError(
            "Organization not found or you do not have access.",
            404
          );
        }

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

        await this.assertCanViewProject(
          project,
          userId,
          client
        );

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
    const organizationMember =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        project.organizationId,
        userId,
        client
      );

    if (
      !organizationMember ||
      organizationMember.status !== "active"
    ) {
      throw this.projectNotFoundError();
    }

    if (
      organizationMember.role === "owner" ||
      organizationMember.role === "admin"
    ) {
      return;
    }

    const projectMember =
      await this.projectMemberRepository.findByProjectAndUser(
        project.id,
        userId,
        client
      );

    if (
      !projectMember ||
      projectMember.status !== "active"
    ) {
      throw this.projectNotFoundError();
    }
  }

  private async assertCanManageProject(
    project: Project,
    userId: string,
    client: import("pg").PoolClient
  ): Promise<void> {
    const organizationMember =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        project.organizationId,
        userId,
        client
      );

    if (
      !organizationMember ||
      organizationMember.status !== "active"
    ) {
      throw this.projectNotFoundError();
    }

    if (
      organizationMember.role === "owner" ||
      organizationMember.role === "admin"
    ) {
      return;
    }

    const projectMember =
      await this.projectMemberRepository.findByProjectAndUser(
        project.id,
        userId,
        client
      );

    if (
      !projectMember ||
      projectMember.status !== "active" ||
      !PROJECT_MANAGER_ROLES.includes(projectMember.role)
    ) {
      throw new AppError(
        "You do not have permission to manage this project.",
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
}
