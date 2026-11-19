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
  AssignOrganizationCustomRoleInput,
  AssignProjectCustomRoleInput,
  RoleAssignmentRepository,
} from "./role-assignment.repository.js";

interface RoleIdRow extends QueryResultRow {
  id: string;
}

interface RoleKeyRow extends QueryResultRow {
  key: string;
}

const ORGANIZATION_BASE_ROLE_KEYS = [
  "owner",
  "admin",
  "member",
] as const;

export class PostgresRoleAssignmentRepository
  implements RoleAssignmentRepository {
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

  private async withClient<T>(
    operationName: string,
    client: PoolClient | undefined,
    operation: (transactionClient: PoolClient) => Promise<T>
  ): Promise<T> {
    if (client) {
      return operation(client);
    }

    return this.transactionManager.runInTransaction(
      operationName,
      operation
    );
  }

  async assignOrganizationRole(
    input: AssignOrganizationRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.withClient(
      "assignOrganizationRole",
      client,
      async (transactionClient) => {
        await this.assertRoleExists(
          "organization",
          input.roleKey,
          transactionClient
        );

        await transactionClient.query(
          `INSERT INTO organization_member_roles (
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT
            om.organization_id,
            om.user_id,
            roles.id,
            $4
          FROM organization_members om
          INNER JOIN roles
            ON roles.scope = 'organization'
           AND roles.key = $3
           AND roles.is_system = TRUE
           AND roles.organization_id IS NULL
          WHERE om.organization_id = $1
            AND om.user_id = $2
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

        await this.assertOrganizationAssignmentExists(
          input.organizationId,
          input.userId,
          input.roleKey,
          transactionClient
        );
      }
    );
  }

  async assignProjectRole(
    input: AssignProjectRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.withClient(
      "assignProjectRole",
      client,
      async (transactionClient) => {
        await this.assertRoleExists(
          "project",
          input.roleKey,
          transactionClient
        );

        await transactionClient.query(
          `INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT
            pm.project_id,
            pm.organization_id,
            pm.user_id,
            roles.id,
            $5
          FROM project_members pm
          INNER JOIN roles
            ON roles.scope = 'project'
           AND roles.key = $4
           AND roles.is_system = TRUE
           AND roles.organization_id IS NULL
          WHERE pm.project_id = $1
            AND pm.organization_id = $2
            AND pm.user_id = $3
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

        await this.assertProjectAssignmentExists(
          input.projectId,
          input.organizationId,
          input.userId,
          input.roleKey,
          transactionClient
        );
      }
    );
  }

  async assignOrganizationCustomRole(
    input: AssignOrganizationCustomRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.withClient(
      "assignOrganizationCustomRole",
      client,
      async (transactionClient) => {
        await transactionClient.query(
          `INSERT INTO organization_member_roles (
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT
            om.organization_id,
            om.user_id,
            roles.id,
            $4
          FROM organization_members om
          INNER JOIN roles
            ON roles.id = $3
           AND roles.scope = 'organization'
           AND roles.is_system = FALSE
           AND roles.organization_id = $1
          WHERE om.organization_id = $1
            AND om.user_id = $2
          ON CONFLICT (
            organization_id,
            user_id,
            role_id
          ) DO NOTHING`,
          [
            input.organizationId,
            input.userId,
            input.roleId,
            input.assignedBy ?? null,
          ]
        );

        await this.assertCustomAssignmentExists(
          "organization",
          input.roleId,
          input.organizationId,
          input.userId,
          transactionClient
        );
      }
    );
  }

  async removeOrganizationCustomRole(
    input: AssignOrganizationCustomRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.execute<RoleIdRow>(
      "removeOrganizationCustomRole",
      client,
      `DELETE FROM organization_member_roles omr
       USING roles
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
         AND omr.role_id = roles.id
         AND roles.id = $3
         AND roles.scope = 'organization'
         AND roles.is_system = FALSE
         AND roles.organization_id = $1`,
      [
        input.organizationId,
        input.userId,
        input.roleId,
      ]
    );
  }

  async assignProjectCustomRole(
    input: AssignProjectCustomRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.withClient(
      "assignProjectCustomRole",
      client,
      async (transactionClient) => {
        await transactionClient.query(
          `INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT
            pm.project_id,
            pm.organization_id,
            pm.user_id,
            roles.id,
            $5
          FROM project_members pm
          INNER JOIN roles
            ON roles.id = $4
           AND roles.scope = 'project'
           AND roles.is_system = FALSE
           AND roles.organization_id = $2
          WHERE pm.project_id = $1
            AND pm.organization_id = $2
            AND pm.user_id = $3
          ON CONFLICT (
            project_id,
            user_id,
            role_id
          ) DO NOTHING`,
          [
            input.projectId,
            input.organizationId,
            input.userId,
            input.roleId,
            input.assignedBy ?? null,
          ]
        );

        await this.assertCustomAssignmentExists(
          "project",
          input.roleId,
          input.organizationId,
          input.userId,
          transactionClient,
          input.projectId
        );
      }
    );
  }

  async removeProjectCustomRole(
    input: AssignProjectCustomRoleInput,
    client?: PoolClient
  ): Promise<void> {
    await this.execute<RoleIdRow>(
      "removeProjectCustomRole",
      client,
      `DELETE FROM project_member_roles pmr
       USING roles
       WHERE pmr.project_id = $1
         AND pmr.organization_id = $2
         AND pmr.user_id = $3
         AND pmr.role_id = roles.id
         AND roles.id = $4
         AND roles.scope = 'project'
         AND roles.is_system = FALSE
         AND roles.organization_id = $2`,
      [
        input.projectId,
        input.organizationId,
        input.userId,
        input.roleId,
      ]
    );
  }

  private async assertOrganizationAssignmentExists(
    organizationId: string,
    userId: string,
    roleKey: string,
    client: PoolClient
  ): Promise<void> {
    const result = await client.query<RoleIdRow>(
      `SELECT omr.role_id AS id
       FROM organization_member_roles omr
       INNER JOIN roles
         ON roles.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
         AND roles.scope = 'organization'
         AND roles.key = $3
         AND roles.is_system = TRUE
         AND roles.organization_id IS NULL`,
      [organizationId, userId, roleKey]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Cannot assign organization role "${roleKey}": organization membership does not exist.`
      );
    }
  }

  private async assertProjectAssignmentExists(
    projectId: string,
    organizationId: string,
    userId: string,
    roleKey: string,
    client: PoolClient
  ): Promise<void> {
    const result = await client.query<RoleIdRow>(
      `SELECT pmr.role_id AS id
       FROM project_member_roles pmr
       INNER JOIN roles
         ON roles.id = pmr.role_id
       WHERE pmr.project_id = $1
         AND pmr.organization_id = $2
         AND pmr.user_id = $3
         AND roles.scope = 'project'
         AND roles.key = $4
         AND roles.is_system = TRUE
         AND roles.organization_id IS NULL`,
      [
        projectId,
        organizationId,
        userId,
        roleKey,
      ]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Cannot assign project role "${roleKey}": project membership does not exist.`
      );
    }
  }

  private async assertCustomAssignmentExists(
    scope: "organization" | "project",
    roleId: string,
    organizationId: string,
    userId: string,
    client: PoolClient,
    projectId?: string
  ): Promise<void> {
    const result = scope === "organization"
      ? await client.query<RoleIdRow>(
        `SELECT omr.role_id AS id
           FROM organization_member_roles omr
           INNER JOIN roles
             ON roles.id = omr.role_id
           WHERE omr.organization_id = $1
             AND omr.user_id = $2
             AND roles.id = $3
             AND roles.scope = 'organization'
             AND roles.is_system = FALSE
             AND roles.organization_id = $1`,
        [organizationId, userId, roleId]
      )
      : await client.query<RoleIdRow>(
        `SELECT pmr.role_id AS id
           FROM project_member_roles pmr
           INNER JOIN roles
             ON roles.id = pmr.role_id
           WHERE pmr.project_id = $1
             AND pmr.organization_id = $2
             AND pmr.user_id = $3
             AND roles.id = $4
             AND roles.scope = 'project'
             AND roles.is_system = FALSE
             AND roles.organization_id = $2`,
        [projectId, organizationId, userId, roleId]
      );

    if (result.rowCount !== 1) {
      throw new Error(
        `Cannot assign custom ${scope} role "${roleId}": role or target membership does not exist in the specified organization and scope.`
      );
    }
  }

  async findOrganizationBaseRoles(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<string[]> {
    const result = await this.execute<RoleKeyRow>(
      "findOrganizationBaseRoles",
      client,
      `SELECT roles.key
       FROM organization_member_roles omr
       INNER JOIN roles
         ON roles.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
         AND roles.scope = 'organization'
         AND roles.is_system = TRUE
         AND roles.organization_id IS NULL
         AND roles.key = ANY($3::text[])
       ORDER BY roles.key ASC`,
      [
        organizationId,
        userId,
        [...ORGANIZATION_BASE_ROLE_KEYS],
      ]
    );

    return result.rows.map((row) => row.key);
  }

  async replaceOrganizationBaseRole(
    input: AssignOrganizationRoleInput,
    client: PoolClient
  ): Promise<void> {
    if (
      !ORGANIZATION_BASE_ROLE_KEYS.includes(
        input.roleKey as (typeof ORGANIZATION_BASE_ROLE_KEYS)[number]
      )
    ) {
      throw new Error(
        `Invalid organization base role "${input.roleKey}".`
      );
    }

    await this.assertRoleExists(
      "organization",
      input.roleKey,
      client
    );

    await client.query(
      `DELETE FROM organization_member_roles omr
       USING roles
       WHERE omr.role_id = roles.id
         AND omr.organization_id = $1
         AND omr.user_id = $2
         AND roles.scope = 'organization'
         AND roles.is_system = TRUE
         AND roles.organization_id IS NULL
         AND roles.key = ANY($3::text[])`,
      [
        input.organizationId,
        input.userId,
        [...ORGANIZATION_BASE_ROLE_KEYS],
      ]
    );

    await client.query(
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
        AND roles.organization_id IS NULL`,
      [
        input.organizationId,
        input.userId,
        input.roleKey,
        input.assignedBy ?? null,
      ]
    );
  }

  private async assertRoleExists(
    scope: "organization" | "project",
    roleKey: string,
    client: PoolClient
  ): Promise<void> {
    const result = await client.query<RoleIdRow>(
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

  async replaceProjectPrimaryRole(
    input: AssignProjectRoleInput,
    previousRoleKey: string,
    client: PoolClient
  ): Promise<void> {
    const validProjectRoles = [
      "project_owner",
      "client",
      "stakeholder",
      "project_manager",
      "technical_lead",
      "developer",
      "qa_engineer",
      "viewer",
    ];

    if (!validProjectRoles.includes(input.roleKey)) {
      throw new Error(
        `Invalid project primary role "${input.roleKey}".`
      );
    }

    if (!validProjectRoles.includes(previousRoleKey)) {
      throw new Error(
        `Invalid previous project primary role "${previousRoleKey}".`
      );
    }

    const roleResult = await client.query(
      `SELECT id
       FROM roles
       WHERE scope = 'project'
         AND key = $1
         AND is_system = TRUE
         AND organization_id IS NULL
       LIMIT 1`,
      [input.roleKey]
    );

    if (roleResult.rows.length === 0) {
      throw new Error(
        `Built-in project role "${input.roleKey}" does not exist.`
      );
    }

    await client.query(
      `DELETE FROM project_member_roles pmr
       USING roles
       WHERE pmr.role_id = roles.id
         AND pmr.project_id = $1
         AND pmr.organization_id = $2
         AND pmr.user_id = $3
         AND roles.scope = 'project'
         AND roles.is_system = TRUE
         AND roles.organization_id IS NULL
         AND roles.key = $4`,
      [
        input.projectId,
        input.organizationId,
        input.userId,
        previousRoleKey,
      ]
    );

    await client.query(
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
      ON CONFLICT (project_id, user_id, role_id)
      DO NOTHING`,
      [
        input.projectId,
        input.organizationId,
        input.userId,
        input.roleKey,
        input.assignedBy ?? null,
      ]
    );
  }
}
