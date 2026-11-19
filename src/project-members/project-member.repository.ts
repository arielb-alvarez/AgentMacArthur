import type { PoolClient } from "pg";

import type {
  CreateProjectMemberInput,
  ProjectMember,
  ProjectMemberRole,
  ProjectMemberStatus,
} from "./project-member.types.js";

export interface ProjectMemberRepository {
  create(
    input: CreateProjectMemberInput,
    client?: PoolClient
  ): Promise<ProjectMember>;

  findByProjectAndUser(
    projectId: string,
    userId: string,
    client?: PoolClient
  ): Promise<ProjectMember | undefined>;

  findByProjectId(
    projectId: string,
    client?: PoolClient
  ): Promise<ProjectMember[]>;

  findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<ProjectMember[]>;

  updateRole(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
    client: PoolClient
  ): Promise<ProjectMember | undefined>;

  updateStatus(
    projectId: string,
    userId: string,
    status: ProjectMemberStatus,
    client: PoolClient
  ): Promise<ProjectMember | undefined>;

  delete(
    projectId: string,
    userId: string,
    client: PoolClient
  ): Promise<boolean>;
}
