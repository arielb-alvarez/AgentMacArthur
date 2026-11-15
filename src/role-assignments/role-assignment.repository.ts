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

export interface RoleAssignmentRepository {
  assignOrganizationRole(
    input: AssignOrganizationRoleInput,
    client?: PoolClient
  ): Promise<void>;

  assignProjectRole(
    input: AssignProjectRoleInput,
    client?: PoolClient
  ): Promise<void>;
}
