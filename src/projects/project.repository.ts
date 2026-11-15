import type { PoolClient } from "pg";

import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
  UpdateProjectStatusInput,
} from "./project.types.js";

export interface ProjectRepository {
  create(
    input: CreateProjectInput,
    client?: PoolClient
  ): Promise<Project>;

  findById(
    id: string,
    client?: PoolClient
  ): Promise<Project | undefined>;

  findByIdAndOrganization(
    id: string,
    organizationId: string,
    client?: PoolClient
  ): Promise<Project | undefined>;

  findAccessibleByUserId(
    userId: string,
    organizationId?: string,
    client?: PoolClient
  ): Promise<Project[]>;

  findByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<Project[]>;

  update(
    id: string,
    organizationId: string,
    input: UpdateProjectInput,
    client?: PoolClient
  ): Promise<Project | undefined>;

  updateStatus(
    id: string,
    organizationId: string,
    input: UpdateProjectStatusInput,
    client?: PoolClient
  ): Promise<Project | undefined>;
}
