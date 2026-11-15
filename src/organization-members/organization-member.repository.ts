import type { PoolClient } from "pg";

import type {
  CreateOrganizationMemberInput,
  OrganizationMember,
} from "./organization-member.types.js";

export interface OrganizationMemberRepository {
  create(
    input: CreateOrganizationMemberInput,
    client?: PoolClient
  ): Promise<OrganizationMember>;

  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember | undefined>;

  findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember[]>;
}
