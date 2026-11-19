import type { PoolClient } from "pg";

import type {
  CreateOrganizationMemberInput,
  OrganizationMember,
  OrganizationMemberDetails,
  OrganizationMemberDirectoryEntry,
} from "./organization-member.types.js";

export interface OrganizationMemberRepository {
  create(
    input: CreateOrganizationMemberInput,
    client?: PoolClient
  ): Promise<OrganizationMember>;

  updateStatus(
    organizationId: string,
    userId: string,
    status: OrganizationMember["status"],
    client?: PoolClient
  ): Promise<OrganizationMember | undefined>;

  updateRole(
    organizationId: string,
    userId: string,
    role: OrganizationMember["role"],
    client?: PoolClient
  ): Promise<OrganizationMember | undefined>;

  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember | undefined>;

  findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember[]>;

  findAllBasicByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDirectoryEntry[]>;

  findAllByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDetails[]>;

  findDetailsByOrganizationAndUser(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDetails | undefined>;
}
