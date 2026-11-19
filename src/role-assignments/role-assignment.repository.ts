import type { PoolClient } from "pg";

export interface AssignOrganizationRoleInput {
  organizationId: string;
  userId: string;
  roleKey: string;
  assignedBy?: string | null;
}

export interface AssignProjectRoleInput {
  projectId: string;
  organizationId: string;
  userId: string;
  roleKey: string;
  assignedBy?: string | null;
}

export interface AssignOrganizationCustomRoleInput {
  organizationId: string;
  userId: string;
  roleId: string;
  assignedBy?: string | null;
}

export interface AssignProjectCustomRoleInput {
  projectId: string;
  organizationId: string;
  userId: string;
  roleId: string;
  assignedBy?: string | null;
}

export interface RoleAssignmentRepository {
  assignOrganizationRole(
    input: AssignOrganizationRoleInput,
    client?: PoolClient
  ): Promise<void>;

  assignProjectRole(
    input: AssignProjectRoleInput,
    client?: PoolClient
  ): Promise<void>;

  assignOrganizationCustomRole(
    input: AssignOrganizationCustomRoleInput,
    client?: PoolClient
  ): Promise<void>;

  removeOrganizationCustomRole(
    input: AssignOrganizationCustomRoleInput,
    client?: PoolClient
  ): Promise<void>;

  assignProjectCustomRole(
    input: AssignProjectCustomRoleInput,
    client?: PoolClient
  ): Promise<void>;

  removeProjectCustomRole(
    input: AssignProjectCustomRoleInput,
    client?: PoolClient
  ): Promise<void>;

  findOrganizationBaseRoles(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<string[]>;

  replaceOrganizationBaseRole(
    input: AssignOrganizationRoleInput,
    client: PoolClient
  ): Promise<void>;

  replaceProjectPrimaryRole(
    input: AssignProjectRoleInput,
    previousRoleKey: string,
    client: PoolClient
  ): Promise<void>;
}
