import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { OrganizationPermissionRepository } from "./organization-permission.repository.js";

export class OrganizationPermissionService {
  constructor(
    private readonly permissionRepository: OrganizationPermissionRepository
  ) {}

  // ============================================================
  // ORGANIZATION PERMISSIONS
  // ============================================================

  async hasOrganizationPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean> {
    return this.permissionRepository.hasOrganizationPermission(
      organizationId,
      userId,
      permissionKey,
      client
    );
  }

  async assertOrganizationPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<void> {
    const allowed = await this.hasOrganizationPermission(
      organizationId,
      userId,
      permissionKey,
      client
    );

    if (!allowed) {
      throw new AppError(
        "You do not have permission to perform this action.",
        403
      );
    }
  }

  // ============================================================
  // PROJECT PERMISSIONS
  // ============================================================

  async hasProjectPermission(
    organizationId: string,
    projectId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean> {
    return this.permissionRepository.hasProjectPermission(
      organizationId,
      projectId,
      userId,
      permissionKey,
      client
    );
  }

  async assertProjectPermission(
    organizationId: string,
    projectId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<void> {
    const allowed = await this.hasProjectPermission(
      organizationId,
      projectId,
      userId,
      permissionKey,
      client
    );

    if (!allowed) {
      throw new AppError(
        "You do not have permission to perform this action.",
        403
      );
    }
  }

  // ============================================================
  // BACKWARD-COMPATIBLE ORGANIZATION PERMISSION ALIASES
  // ============================================================

  async hasPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean> {
    return this.hasOrganizationPermission(
      organizationId,
      userId,
      permissionKey,
      client
    );
  }

  async assertPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<void> {
    return this.assertOrganizationPermission(
      organizationId,
      userId,
      permissionKey,
      client
    );
  }
}
