import type { PoolClient } from "pg";

import type {
  CreateCustomRoleInput,
  ManagedRole,
  ManagedRoleScope,
  PermissionDefinition,
  UpdateCustomRoleInput,
} from "./role-management.types.js";

export type DeleteCustomRoleResult =
  | "deleted"
  | "not_found"
  | "assigned";

export interface RoleManagementRepository {
  findAllByOrganizationId(
    organizationId: string,
    scope?: ManagedRoleScope,
    client?: PoolClient
  ): Promise<ManagedRole[]>;

  findById(
    organizationId: string,
    roleId: string,
    client?: PoolClient
  ): Promise<ManagedRole | undefined>;

  createCustomRole(
    input: CreateCustomRoleInput,
    client?: PoolClient
  ): Promise<ManagedRole>;

  updateCustomRole(
    input: UpdateCustomRoleInput,
    client?: PoolClient
  ): Promise<ManagedRole | undefined>;

  deleteCustomRole(
    organizationId: string,
    roleId: string,
    client?: PoolClient
  ): Promise<DeleteCustomRoleResult>;

  findPermissionsByScope(
    scope: ManagedRoleScope,
    client?: PoolClient
  ): Promise<PermissionDefinition[]>;

  replacePermissions(
    organizationId: string,
    roleId: string,
    permissionIds: string[],
    client?: PoolClient
  ): Promise<void>;
}
