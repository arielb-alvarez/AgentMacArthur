import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";
import type { TransactionManager } from "../database/transaction-manager.js";

import type { OrganizationRepository } from "./organization.repository.js";

import type {
  CreateOrganizationInput,
  Organization,
  OrganizationType,
  UpdateOrganizationInput,
} from "./organization.types.js";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  owner_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export class PostgresOrganizationRepository
  implements OrganizationRepository
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

  private mapOrganization(row: OrganizationRow): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(
    input: CreateOrganizationInput,
    client?: PoolClient
  ): Promise<Organization> {
    return this.execute(
      "createOrganization",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `INSERT INTO organizations (
            id,
            name,
            slug,
            type,
            owner_user_id
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id,
            name,
            slug,
            type,
            owner_user_id,
            created_at,
            updated_at`,
          [
            randomUUID(),
            input.name.trim(),
            input.slug.trim().toLowerCase(),
            input.type,
            input.ownerUserId,
          ]
        );

        return this.mapOrganization(result.rows[0]);
      },
      client
    );
  }

  async findById(
    id: string,
    client?: PoolClient
  ): Promise<Organization | undefined> {
    return this.execute(
      "findOrganizationById",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `SELECT
            id,
            name,
            slug,
            type,
            owner_user_id,
            created_at,
            updated_at
          FROM organizations
          WHERE id = $1`,
          [id]
        );

        const row = result.rows[0];

        return row ? this.mapOrganization(row) : undefined;
      },
      client
    );
  }

  async findByIdForUpdate(
    id: string,
    client: PoolClient
  ): Promise<Organization | undefined> {
    const result = await client.query<OrganizationRow>(
      `SELECT
        id,
        name,
        slug,
        type,
        owner_user_id,
        created_at,
        updated_at
      FROM organizations
      WHERE id = $1
      FOR UPDATE`,
      [id]
    );

    const row = result.rows[0];

    return row ? this.mapOrganization(row) : undefined;
  }

  async updateOwner(
    id: string,
    ownerUserId: string,
    client: PoolClient
  ): Promise<Organization | undefined> {
    const result = await client.query<OrganizationRow>(
      `UPDATE organizations
       SET
         owner_user_id = $2,
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         name,
         slug,
         type,
         owner_user_id,
         created_at,
         updated_at`,
      [id, ownerUserId]
    );

    const row = result.rows[0];

    return row ? this.mapOrganization(row) : undefined;
  }

  async findBySlug(
    slug: string,
    client?: PoolClient
  ): Promise<Organization | undefined> {
    return this.execute(
      "findOrganizationBySlug",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `SELECT
            id,
            name,
            slug,
            type,
            owner_user_id,
            created_at,
            updated_at
          FROM organizations
          WHERE slug = $1`,
          [slug.trim().toLowerCase()]
        );

        const row = result.rows[0];

        return row ? this.mapOrganization(row) : undefined;
      },
      client
    );
  }

  async findPersonalByOwnerId(
    ownerUserId: string,
    client?: PoolClient
  ): Promise<Organization | undefined> {
    return this.execute(
      "findPersonalOrganizationByOwnerId",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `SELECT
            id,
            name,
            slug,
            type,
            owner_user_id,
            created_at,
            updated_at
          FROM organizations
          WHERE owner_user_id = $1
            AND type = 'personal'`,
          [ownerUserId]
        );

        const row = result.rows[0];

        return row ? this.mapOrganization(row) : undefined;
      },
      client
    );
  }

  async findByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<Organization[]> {
    return this.execute(
      "findOrganizationsByUser",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `SELECT
            o.id,
            o.name,
            o.slug,
            o.type,
            o.owner_user_id,
            o.created_at,
            o.updated_at
          FROM organizations o
          INNER JOIN organization_members om
            ON om.organization_id = o.id
          WHERE om.user_id = $1
            AND om.status = 'active'
          ORDER BY o.created_at DESC, o.id ASC`,
          [userId]
        );

        return result.rows.map((row) =>
          this.mapOrganization(row)
        );
      },
      client
    );
  }

  async update(
    id: string,
    input: UpdateOrganizationInput,
    client?: PoolClient
  ): Promise<Organization | undefined> {
    return this.execute(
      "updateOrganization",
      async (connection) => {
        const result = await connection.query<OrganizationRow>(
          `UPDATE organizations
          SET
            name = COALESCE($2, name),
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            name,
            slug,
            type,
            owner_user_id,
            created_at,
            updated_at`,
          [id, input.name?.trim() ?? null]
        );

        const row = result.rows[0];

        return row ? this.mapOrganization(row) : undefined;
      },
      client
    );
  }
}
