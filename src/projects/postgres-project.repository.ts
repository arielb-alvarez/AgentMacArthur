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

import type { ProjectRepository } from "./project.repository.js";

import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectInput,
  UpdateProjectStatusInput,
} from "./project.types.js";

interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export class PostgresProjectRepository implements ProjectRepository {
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

  private mapProject(row: ProjectRow): Project {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(
    input: CreateProjectInput,
    client?: PoolClient
  ): Promise<Project> {
    const result = await this.execute<ProjectRow>(
      "createProject",
      client,
      `INSERT INTO projects (
        id,
        organization_id,
        name,
        description,
        created_by
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4)
      RETURNING
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at`,
      [
        input.organizationId,
        input.name.trim(),
        input.description?.trim() || null,
        input.createdBy,
      ]
    );

    return this.mapProject(result.rows[0]!);
  }

  async findById(
    id: string,
    client?: PoolClient
  ): Promise<Project | undefined> {
    const result = await this.execute<ProjectRow>(
      "findProjectById",
      client,
      `SELECT
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at
      FROM projects
      WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];

    return row ? this.mapProject(row) : undefined;
  }

  async findByIdAndOrganization(
    id: string,
    organizationId: string,
    client?: PoolClient
  ): Promise<Project | undefined> {
    const result = await this.execute<ProjectRow>(
      "findProjectByIdAndOrganization",
      client,
      `SELECT
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at
      FROM projects
      WHERE id = $1
        AND organization_id = $2`,
      [id, organizationId]
    );

    const row = result.rows[0];

    return row ? this.mapProject(row) : undefined;
  }

  async findAccessibleByUserId(
    userId: string,
    organizationId?: string,
    client?: PoolClient
  ): Promise<Project[]> {
    const values: unknown[] = [userId];
    let organizationFilter = "";

    if (organizationId) {
      values.push(organizationId);
      organizationFilter = `AND p.organization_id = $2`;
    }

    const result = await this.execute<ProjectRow>(
      "findAccessibleProjectsByUser",
      client,
      `SELECT
        p.id,
        p.organization_id,
        p.name,
        p.description,
        p.status,
        p.created_by,
        p.created_at,
        p.updated_at
      FROM projects p
      INNER JOIN organization_members om
        ON om.organization_id = p.organization_id
       AND om.user_id = $1
       AND om.status = 'active'
      WHERE (
        om.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM project_members pm
          WHERE pm.project_id = p.id
            AND pm.organization_id = p.organization_id
            AND pm.user_id = $1
            AND pm.status = 'active'
        )
      )
      ${organizationFilter}
      ORDER BY p.created_at DESC, p.id ASC`,
      values
    );

    return result.rows.map((row) => this.mapProject(row));
  }

  async findByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<Project[]> {
    const result = await this.execute<ProjectRow>(
      "findProjectsByOrganization",
      client,
      `SELECT
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at
      FROM projects
      WHERE organization_id = $1
      ORDER BY created_at DESC, id ASC`,
      [organizationId]
    );

    return result.rows.map((row) => this.mapProject(row));
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateProjectInput,
    client?: PoolClient
  ): Promise<Project | undefined> {
    const result = await this.execute<ProjectRow>(
      "updateProject",
      client,
      `UPDATE projects
      SET
        name = COALESCE($3, name),
        description = CASE
          WHEN $4::boolean THEN $5
          ELSE description
        END,
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      RETURNING
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at`,
      [
        id,
        organizationId,
        input.name === undefined ? null : input.name.trim(),
        input.description !== undefined,
        input.description?.trim() || null,
      ]
    );

    const row = result.rows[0];

    return row ? this.mapProject(row) : undefined;
  }

  async updateStatus(
    id: string,
    organizationId: string,
    input: UpdateProjectStatusInput,
    client?: PoolClient
  ): Promise<Project | undefined> {
    const result = await this.execute<ProjectRow>(
      "updateProjectStatus",
      client,
      `UPDATE projects
      SET
        status = $3,
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      RETURNING
        id,
        organization_id,
        name,
        description,
        status,
        created_by,
        created_at,
        updated_at`,
      [id, organizationId, input.status]
    );

    const row = result.rows[0];

    return row ? this.mapProject(row) : undefined;
  }
}
