import type { PoolClient } from "pg";

import type {
  CreateProjectMemberInput,
  ProjectMember,
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
}
