import type {
  Pool,
  PoolClient,
  QueryResultRow,
} from "pg";

import { pool as defaultPool } from "../config/database.js";
import {
  PostgresTransactionManager,
  type TransactionManager,
} from "../database/transaction-manager.js";

import type { OrganizationPermissionRepository } from "./organization-permission.repository.js";

interface PermissionCheckRow extends QueryResultRow {
  allowed: boolean;
}

export class PostgresOrganizationPermissionRepository
  implements OrganizationPermissionRepository
{
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly db: Pool = defaultPool,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager =
      transactionManager ?? new PostgresTransactionManager(this.db);
  }

  async hasOrganizationPermission(
    organizationId: string,
    userId: string,
    permissionKey: string,
    client?: PoolClient
  ): Promise<boolean> {
    const query = async (
      connection: PoolClient
    ): Promise<boolean> => {
      const result = await connection.query<PermissionCheckRow>(
        `SELECT EXISTS (
          SELECT 1
          FROM organization_members om
          INNER JOIN organization_member_roles omr
            ON omr.organization_id = om.organization_id
           AND omr.user_id = om.user_id
          INNER JOIN roles r
            ON r.id = omr.role_id
           AND r.scope = 'organization'
           AND (
             r.is_system = TRUE
             OR r.organization_id = om.organization_id
           )
          INNER JOIN role_permissions rp
            ON rp.role_id = r.id
          INNER JOIN permissions p
            ON p.id = rp.permission_id
           AND p.scope = 'organization'
          WHERE om.organization_id = $1
            AND om.user_id = $2
            AND om.status = 'active'
            AND p.key = $3
        ) AS allowed`,
        [organizationId, userId, permissionKey]
      );

      return result.rows[0]?.allowed === true;
    };

    if (client) {
      return query(client);
    }

    return this.transactionManager.runInTransaction(
      "checkOrganizationPermission",
      query
    );
  }
}
