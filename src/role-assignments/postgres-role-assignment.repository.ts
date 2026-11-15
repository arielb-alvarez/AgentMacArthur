import type {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
} from "pg";

import { pool as defaultPool } from "../config/database.js";
import {
  PostgresTransactionManager,
  type TransactionManager,
} from "../database/transaction-manager.js";

import type {
  AssignOrganizationRoleInput,
  AssignProjectRoleInput,
  RoleAssignmentRepository,
} from "./role-assignment.repository.js";

interface RoleIdRow extends QueryResultRow {
  id: string;
}

export class PostgresRoleAssignmentRepository
  implements RoleAssignmentRepository
{
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly db: Pool = defaultPool,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager =
      transactionManager ?? new PostgresTransactionManager(this.db);
  }

  private async execute<T extends QueryResultRow>(
    operationName: string,
    client: PoolClient | undefined,
    query: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(query, values);
    }

    return this.transactionManager.runInTransaction(
      operationName,
      async (transactionClient) =>
        transactionClient.query<T>(query, values)
    );
  }

  async assignOrganizationRole(
    input: AssignOrganizationRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.execute<RoleIdRow>(
      "assignOrganizationRole",
      client,
      `INSERT INTO organization_member_roles (
        organization_id,
        user_id,
        role_id,
        assigned_by
      )
      SELECT
        $1,
        $2,
        roles.id,
        $4
      FROM roles
      WHERE roles.scope = 'organization'
        AND roles.key = $3
        AND roles.is_system = TRUE
        AND roles.organization_id IS NULL
      ON CONFLICT (
        organization_id,
        user_id,
        role_id
      ) DO NOTHING`,
      [
        input.organizationId,
        input.userId,
        input.roleKey,
        input.assignedBy ?? null,
      ]
    );

    await this.assertRoleExists(
      "organization",
      input.roleKey,
      client
    );
  }

  async assignProjectRole(
    input: AssignProjectRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.execute<RoleIdRow>(
      "assignProjectRole",
      client,
      `INSERT INTO project_member_roles (
        project_id,
        organization_id,
        user_id,
        role_id,
        assigned_by
      )
      SELECT
        $1,
        $2,
        $3,
        roles.id,
        $5
      FROM roles
      WHERE roles.scope = 'project'
        AND roles.key = $4
        AND roles.is_system = TRUE
        AND roles.organization_id IS NULL
      ON CONFLICT (
        project_id,
        user_id,
        role_id
      ) DO NOTHING`,
      [
        input.projectId,
        input.organizationId,
        input.userId,
        input.roleKey,
        input.assignedBy ?? null,
      ]
    );

    await this.assertRoleExists(
      "project",
      input.roleKey,
      client
    );
  }

  private async assertRoleExists(
    scope: "organization" | "project",
    roleKey: string,
    client?: PoolClient
  ): Promise<void> {
    const result = await this.execute<RoleIdRow>(
      "verifyBuiltInRole",
      client,
      `SELECT id
       FROM roles
       WHERE scope = $1
         AND key = $2
         AND is_system = TRUE
         AND organization_id IS NULL`,
      [scope, roleKey]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Built-in ${scope} role "${roleKey}" does not exist.`
      );
    }
  }
}
