import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { OrganizationPermissionRepository } from "./organization-permission.repository.js";

export class OrganizationPermissionService {
  constructor(
    private readonly permissionRepository: OrganizationPermissionRepository
  ) {}

  async hasPermission(
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

  async assertPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<void> {
    const allowed = await this.hasPermission(
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
}
