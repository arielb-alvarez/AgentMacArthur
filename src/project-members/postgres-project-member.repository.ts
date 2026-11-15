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

import type { ProjectMemberRepository } from "./project-member.repository.js";

import type {
  CreateProjectMemberInput,
  ProjectMember,
} from "./project-member.types.js";

interface ProjectMemberRow {
  project_id: string;
  organization_id: string;
  user_id: string;
  role: ProjectMember["role"];
  status: ProjectMember["status"];
  joined_at: Date;
}

export class PostgresProjectMemberRepository
  implements ProjectMemberRepository
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
      async (transactionClient) => {
        return transactionClient.query<T>(query, values);
      }
    );
  }

  private mapProjectMember(row: ProjectMemberRow): ProjectMember {
    return {
      projectId: row.project_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
    };
  }

  async create(
    input: CreateProjectMemberInput,
    client?: PoolClient
  ): Promise<ProjectMember> {
    const result = await this.execute<ProjectMemberRow>(
      "createProjectMember",
      client,
      `INSERT INTO project_members (
        project_id,
        organization_id,
        user_id,
        role,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        project_id,
        organization_id,
        user_id,
        role,
        status,
        joined_at`,
      [
        input.projectId,
        input.organizationId,
        input.userId,
        input.role,
        input.status ?? "active",
      ]
    );

    return this.mapProjectMember(result.rows[0]!);
  }

  async findByProjectAndUser(
    projectId: string,
    userId: string,
    client?: PoolClient
  ): Promise<ProjectMember | undefined> {
    const result = await this.execute<ProjectMemberRow>(
      "findProjectMember",
      client,
      `SELECT
        project_id,
        organization_id,
        user_id,
        role,
        status,
        joined_at
      FROM project_members
      WHERE project_id = $1
        AND user_id = $2`,
      [projectId, userId]
    );

    const row = result.rows[0];

    return row ? this.mapProjectMember(row) : undefined;
  }

  async findByProjectId(
    projectId: string,
    client?: PoolClient
  ): Promise<ProjectMember[]> {
    const result = await this.execute<ProjectMemberRow>(
      "findProjectMembersByProject",
      client,
      `SELECT
        project_id,
        organization_id,
        user_id,
        role,
        status,
        joined_at
      FROM project_members
      WHERE project_id = $1
      ORDER BY joined_at ASC, user_id ASC`,
      [projectId]
    );

    return result.rows.map((row) =>
      this.mapProjectMember(row)
    );
  }

  async findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<ProjectMember[]> {
    const result = await this.execute<ProjectMemberRow>(
      "findProjectMembersByUser",
      client,
      `SELECT
        project_id,
        organization_id,
        user_id,
        role,
        status,
        joined_at
      FROM project_members
      WHERE user_id = $1
      ORDER BY joined_at DESC, project_id ASC`,
      [userId]
    );

    return result.rows.map((row) =>
      this.mapProjectMember(row)
    );
  }
}
