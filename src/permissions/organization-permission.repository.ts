import type { PoolClient } from "pg";

export interface OrganizationPermissionRepository {
  hasOrganizationPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean>;

  hasProjectPermission(
    organizationId: string,
    projectId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean>;
}
