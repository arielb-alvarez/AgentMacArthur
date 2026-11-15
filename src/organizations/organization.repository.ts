import type { PoolClient } from "pg";

import type {
  CreateOrganizationInput,
  Organization,
  UpdateOrganizationInput,
} from "./organization.types.js";

export interface OrganizationRepository {
  create(
    input: CreateOrganizationInput,
    client?: PoolClient
  ): Promise<Organization>;

  findById(
    id: string,
    client?: PoolClient
  ): Promise<Organization | undefined>;

  findBySlug(
    slug: string,
    client?: PoolClient
  ): Promise<Organization | undefined>;

  findPersonalByOwnerId(
    ownerUserId: string,
    client?: PoolClient
  ): Promise<Organization | undefined>;

  findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<Organization[]>;

  update(
    id: string,
    input: UpdateOrganizationInput,
    client?: PoolClient
  ): Promise<Organization | undefined>;
}
