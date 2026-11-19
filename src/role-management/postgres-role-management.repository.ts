import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";
import type { TransactionManager } from "../database/transaction-manager.js";

import type { RoleManagementRepository } from "./role-management.repository.js";
import type {
  CreateCustomRoleInput,
  ManagedRole,
  ManagedRoleScope,
  PermissionDefinition,
  UpdateCustomRoleInput,
} from "./role-management.types.js";
import type { DeleteCustomRoleResult } from "./role-management.repository.js";

interface ManagedRoleRow {
  id: string;
  organization_id: string;
  scope: ManagedRoleScope;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

interface PermissionRow {
  id: string;
  scope: ManagedRoleScope;
  key: string;
  description: string;
  created_at: Date;
}

export class PostgresRoleManagementRepository
  implements RoleManagementRepository
{
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly db: Pool = defaultPool,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager =
      transactionManager ?? new PostgresTransactionManager(this.db);
  }

  private async execute<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>,
    client?: PoolClient
  ): Promise<T> {
    if (client) {
      return operation(client);
    }

    return this.transactionManager.runInTransaction(
      operationName,
      operation
    );
  }

  private mapRole(row: ManagedRoleRow): ManagedRole {
    return {
      id: row.id,
      organizationId: row.organization_id,
      scope: row.scope,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.is_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPermission(
    row: PermissionRow
  ): PermissionDefinition {
    return {
      id: row.id,
      scope: row.scope,
      key: row.key,
      description: row.description,
      createdAt: row.created_at,
    };
  }

  async findAllByOrganizationId(
    organizationId: string,
    scope?: ManagedRoleScope,
    client?: PoolClient
  ): Promise<ManagedRole[]> {
    return this.execute(
      "findCustomRolesByOrganization",
      async (connection) => {
        const result = await connection.query<ManagedRoleRow>(
          `SELECT
             id,
             organization_id,
             scope,
             key,
             name,
             description,
             is_system,
             created_at,
             updated_at
           FROM roles
           WHERE organization_id = $1
             AND is_system = FALSE
             AND ($2::varchar IS NULL OR scope = $2)
           ORDER BY scope ASC, name ASC, id ASC`,
          [organizationId, scope ?? null]
        );

        return result.rows.map((row) => this.mapRole(row));
      },
      client
    );
  }

  async findById(
    organizationId: string,
    roleId: string,
    client?: PoolClient
  ): Promise<ManagedRole | undefined> {
    return this.execute(
      "findCustomRoleById",
      async (connection) => {
        const result = await connection.query<ManagedRoleRow>(
          `SELECT
             id,
             organization_id,
             scope,
             key,
             name,
             description,
             is_system,
             created_at,
             updated_at
           FROM roles
           WHERE id = $1
             AND organization_id = $2
             AND is_system = FALSE`,
          [roleId, organizationId]
        );

        const row = result.rows[0];

        return row ? this.mapRole(row) : undefined;
      },
      client
    );
  }

  async createCustomRole(
    input: CreateCustomRoleInput,
    client?: PoolClient
  ): Promise<ManagedRole> {
    return this.execute(
      "createCustomRole",
      async (connection) => {
        const result = await connection.query<ManagedRoleRow>(
          `INSERT INTO roles (
             organization_id,
             scope,
             key,
             name,
             description,
             is_system
           )
           VALUES ($1, $2, $3, $4, $5, FALSE)
           RETURNING
             id,
             organization_id,
             scope,
             key,
             name,
             description,
             is_system,
             created_at,
             updated_at`,
          [
            input.organizationId,
            input.scope,
            input.key.trim().toLowerCase(),
            input.name.trim(),
            input.description?.trim() || null,
          ]
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error("Could not create custom role.");
        }

        return this.mapRole(row);
      },
      client
    );
  }

  async updateCustomRole(
    input: UpdateCustomRoleInput,
    client?: PoolClient
  ): Promise<ManagedRole | undefined> {
    return this.execute(
      "updateCustomRole",
      async (connection) => {
        const result = await connection.query<ManagedRoleRow>(
          `UPDATE roles
           SET
             name = $3,
             description = CASE
               WHEN $4::boolean THEN $5
               ELSE description
             END,
             updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2
             AND is_system = FALSE
           RETURNING
             id,
             organization_id,
             scope,
             key,
             name,
             description,
             is_system,
             created_at,
             updated_at`,
          [
            input.roleId,
            input.organizationId,
            input.name.trim(),
            input.description !== undefined,
            input.description?.trim() || null,
          ]
        );

        const row = result.rows[0];

        return row ? this.mapRole(row) : undefined;
      },
      client
    );
  }

  async deleteCustomRole(
    organizationId: string,
    roleId: string,
    client?: PoolClient
  ): Promise<DeleteCustomRoleResult> {
    return this.execute(
      "deleteCustomRole",
      async (connection) => {
        const roleResult = await connection.query(
          `SELECT id
           FROM roles
           WHERE id = $1
             AND organization_id = $2
             AND is_system = FALSE
           FOR UPDATE`,
          [roleId, organizationId]
        );

        if (roleResult.rowCount === 0) {
          return "not_found";
        }

        const assignmentResult = await connection.query(
          `SELECT EXISTS (
             SELECT 1
             FROM organization_member_roles
             WHERE role_id = $1

             UNION ALL

             SELECT 1
             FROM project_member_roles
             WHERE role_id = $1
           ) AS is_assigned`,
          [roleId]
        );

        if (assignmentResult.rows[0]?.is_assigned) {
          return "assigned";
        }

        const deleteResult = await connection.query(
          `DELETE FROM roles
           WHERE id = $1
             AND organization_id = $2
             AND is_system = FALSE`,
          [roleId, organizationId]
        );

        return deleteResult.rowCount === 1
          ? "deleted"
          : "not_found";
      },
      client
    );
  }

  async findPermissionsByScope(
    scope: ManagedRoleScope,
    client?: PoolClient
  ): Promise<PermissionDefinition[]> {
    return this.execute(
      "findPermissionsByScope",
      async (connection) => {
        const result = await connection.query<PermissionRow>(
          `SELECT
             id,
             scope,
             key,
             description,
             created_at
           FROM permissions
           WHERE scope = $1
           ORDER BY key ASC, id ASC`,
          [scope]
        );

        return result.rows.map((row) =>
          this.mapPermission(row)
        );
      },
      client
    );
  }

  async replacePermissions(
    organizationId: string,
    roleId: string,
    permissionIds: string[],
    client?: PoolClient
  ): Promise<void> {
    await this.execute(
      "replaceCustomRolePermissions",
      async (connection) => {
        const roleResult = await connection.query<{
          id: string;
          scope: ManagedRoleScope;
        }>(
          `SELECT id, scope
           FROM roles
           WHERE id = $1
             AND organization_id = $2
             AND is_system = FALSE
           FOR UPDATE`,
          [roleId, organizationId]
        );

        const role = roleResult.rows[0];

        if (!role) {
          throw new Error(
            "Custom role not found in the specified organization."
          );
        }

        const uniquePermissionIds = [...new Set(permissionIds)];

        if (uniquePermissionIds.length > 0) {
          const permissionResult = await connection.query(
            `SELECT id
             FROM permissions
             WHERE id = ANY($1::uuid[])
               AND scope = $2`,
            [uniquePermissionIds, role.scope]
          );

          if (
            permissionResult.rowCount !==
            uniquePermissionIds.length
          ) {
            throw new Error(
              "One or more permissions do not exist or do not match the custom role scope."
            );
          }
        }

        await connection.query(
          `DELETE FROM role_permissions
           WHERE role_id = $1`,
          [roleId]
        );

        if (uniquePermissionIds.length > 0) {
          await connection.query(
            `INSERT INTO role_permissions (
               role_id,
               permission_id
             )
             SELECT $1, permission_id
             FROM UNNEST($2::uuid[]) AS permission_id`,
            [roleId, uniquePermissionIds]
          );
        }
      },
      client
    );
  }
}
