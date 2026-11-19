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

import type { OrganizationMemberRepository } from "./organization-member.repository.js";

import type {
  CreateOrganizationMemberInput,
  OrganizationMember,
  OrganizationMemberAssignedRole,
  OrganizationMemberDetails,
  OrganizationMemberDirectoryEntry,
} from "./organization-member.types.js";

interface OrganizationMemberRow extends QueryResultRow {
  organization_id: string;
  user_id: string;
  role: OrganizationMember["role"];
  status: OrganizationMember["status"];
  joined_at: Date;
}

interface OrganizationMemberDirectoryRow extends QueryResultRow {
  user_id: string;
  display_name: string;
}

interface OrganizationMemberDetailsRow extends QueryResultRow {
  organization_id: string;
  user_id: string;
  email: string;
  display_name: string;
  user_status: OrganizationMemberDetails["userStatus"];
  status: OrganizationMemberDetails["status"];
  roles: OrganizationMemberAssignedRole[];
  joined_at: Date;
}

export class PostgresOrganizationMemberRepository
  implements OrganizationMemberRepository {
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

  private mapOrganizationMemberDetails(
    row: OrganizationMemberDetailsRow
  ): OrganizationMemberDetails {
    return {
      organizationId: row.organization_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      userStatus: row.user_status,
      status: row.status,
      roles: row.roles,
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

  async updateStatus(
    organizationId: string,
    userId: string,
    status: OrganizationMember["status"],
    client?: PoolClient
  ): Promise<OrganizationMember | undefined> {
    const result = await this.execute<OrganizationMemberRow>(
      "updateOrganizationMemberStatus",
      client,
      `UPDATE organization_members
      SET status = $3
      WHERE organization_id = $1
        AND user_id = $2
      RETURNING
        organization_id,
        user_id,
        role,
        status,
        joined_at`,
      [organizationId, userId, status]
    );

    const row = result.rows[0];

    return row ? this.mapOrganizationMember(row) : undefined;
  }

  async updateRole(
    organizationId: string,
    userId: string,
    role: OrganizationMember["role"],
    client?: PoolClient
  ): Promise<OrganizationMember | undefined> {
    const result = await this.execute<OrganizationMemberRow>(
      "updateOrganizationMemberRole",
      client,
      `UPDATE organization_members
      SET role = $3
      WHERE organization_id = $1
        AND user_id = $2
      RETURNING
        organization_id,
        user_id,
        role,
        status,
        joined_at`,
      [organizationId, userId, role]
    );

    const row = result.rows[0];

    return row ? this.mapOrganizationMember(row) : undefined;
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

  async findAllBasicByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDirectoryEntry[]> {
    const result =
      await this.execute<OrganizationMemberDirectoryRow>(
        "findAllBasicOrganizationMembers",
        client,
        `SELECT
          om.user_id,
          u.display_name
        FROM organization_members om
        INNER JOIN users u
          ON u.id = om.user_id
        WHERE om.organization_id = $1
        ORDER BY
          om.joined_at ASC,
          u.display_name ASC,
          om.user_id ASC`,
        [organizationId]
      );

    return result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
    }));
  }

  async findAllByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDetails[]> {
    const result =
      await this.execute<OrganizationMemberDetailsRow>(
        "findAllOrganizationMembers",
        client,
        `SELECT
          om.organization_id,
          om.user_id,
          u.email,
          u.display_name,
          u.status AS user_status,
          om.status,
          om.joined_at,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'key', r.key,
                'name', r.name,
                'description', r.description,
                'isSystem', r.is_system
              )
              ORDER BY r.name, r.key
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'::jsonb
          ) AS roles
        FROM organization_members om
        INNER JOIN users u
          ON u.id = om.user_id
        LEFT JOIN organization_member_roles omr
          ON omr.organization_id = om.organization_id
          AND omr.user_id = om.user_id
        LEFT JOIN roles r
          ON r.id = omr.role_id
        WHERE om.organization_id = $1
        GROUP BY
          om.organization_id,
          om.user_id,
          u.email,
          u.display_name,
          u.status,
          om.status,
          om.joined_at
        ORDER BY
          om.joined_at ASC,
          u.display_name ASC,
          om.user_id ASC`,
        [organizationId]
      );

    return result.rows.map((row) =>
      this.mapOrganizationMemberDetails(row)
    );
  }

  async findDetailsByOrganizationAndUser(
    organizationId: string,
    userId: string,
    client?: PoolClient
  ): Promise<OrganizationMemberDetails | undefined> {
    const result =
      await this.execute<OrganizationMemberDetailsRow>(
        "findOrganizationMemberDetails",
        client,
        `SELECT
          om.organization_id,
          om.user_id,
          u.email,
          u.display_name,
          u.status AS user_status,
          om.status,
          om.joined_at,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'key', r.key,
                'name', r.name,
                'description', r.description,
                'isSystem', r.is_system
              )
              ORDER BY r.name, r.key
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'::jsonb
          ) AS roles
        FROM organization_members om
        INNER JOIN users u
          ON u.id = om.user_id
        LEFT JOIN organization_member_roles omr
          ON omr.organization_id = om.organization_id
          AND omr.user_id = om.user_id
        LEFT JOIN roles r
          ON r.id = omr.role_id
        WHERE om.organization_id = $1
          AND om.user_id = $2
        GROUP BY
          om.organization_id,
          om.user_id,
          u.email,
          u.display_name,
          u.status,
          om.status,
          om.joined_at`,
        [organizationId, userId]
      );

    const row = result.rows[0];

    return row
      ? this.mapOrganizationMemberDetails(row)
      : undefined;
  }
}
