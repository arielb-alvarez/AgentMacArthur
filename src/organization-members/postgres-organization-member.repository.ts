import type {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
} from "pg";

import { pool as defaultPool } from "../config/database.js";
import { env } from "../config/env.js";
import {
  PostgresTransactionManager,
  type TransactionManager,
} from "../database/transaction-manager.js";

import type {
  CreateOrganizationMemberInput,
  OrganizationMember,
} from "./organization-member.types.js";

interface OrganizationMemberRow {
  organization_id: string;
  user_id: string;
  role: OrganizationMember["role"];
  status: OrganizationMember["status"];
  joined_at: Date;
}

export class PostgresOrganizationMemberRepository {
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

  private mapOrganizationMember(
    row: OrganizationMemberRow
  ): OrganizationMember {
    return {
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
    };
  }

  async create(
    input: CreateOrganizationMemberInput,
    client?: PoolClient
  ): Promise<OrganizationMember> {
    const result = await this.execute<OrganizationMemberRow>(
      "createOrganizationMember",
      client,
      `INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        status
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        organization_id,
        user_id,
        role,
        status,
        joined_at`,
      [
        input.organizationId,
        input.userId,
        input.role,
        input.status,
      ]
    );

    return this.mapOrganizationMember(result.rows[0]!);
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember | undefined> {
    const result = await this.execute<OrganizationMemberRow>(
      "findOrganizationMember",
      client,
      `SELECT
        organization_id,
        user_id,
        role,
        status,
        joined_at
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2`,
      [organizationId, userId]
    );

    const row = result.rows[0];

    return row ? this.mapOrganizationMember(row) : undefined;
  }

  async findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMember[]> {
    const result = await this.execute<OrganizationMemberRow>(
      "findOrganizationMembersByUser",
      client,
      `SELECT
        organization_id,
        user_id,
        role,
        status,
        joined_at
      FROM organization_members
      WHERE user_id = $1
      ORDER BY joined_at DESC, organization_id ASC`,
      [userId]
    );

    return result.rows.map((row) =>
      this.mapOrganizationMember(row)
    );
  }
}
