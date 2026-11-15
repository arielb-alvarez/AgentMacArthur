import { randomUUID } from "node:crypto";

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
  AuthToken,
  AuthTokenPurpose,
  CreateAuthTokenInput,
} from "./auth-token.types.js";

interface AuthTokenRow extends QueryResultRow {
  id: string;
  user_id: string;
  purpose: AuthTokenPurpose;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

interface AuthTokenIdRow extends QueryResultRow {
  id: string;
}

export class PostgresAuthTokenRepository {
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

  private mapAuthToken(row: AuthTokenRow): AuthToken {
    return {
      id: row.id,
      userId: row.user_id,
      purpose: row.purpose,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      createdAt: row.created_at,
    };
  }

  async create(
    input: CreateAuthTokenInput,
    client?: PoolClient
  ): Promise<AuthToken> {
    const id = randomUUID();

    const result = await this.execute<AuthTokenRow>(
        "createAuthToken",
        client,
        `INSERT INTO auth_tokens (
        id,
        user_id,
        purpose,
        token_hash,
        expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
        id,
        user_id,
        purpose,
        expires_at,
        consumed_at,
        created_at`,
        [
        id,
        input.userId,
        input.purpose,
        input.tokenHash,
        input.expiresAt,
        ]
    );

    return this.mapAuthToken(result.rows[0]!);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
    client?: PoolClient
  ): Promise<AuthToken | undefined> {
    const result = await this.execute<AuthTokenRow>(
      "findActiveAuthToken",
      client,
      `SELECT
        id,
        user_id,
        purpose,
        expires_at,
        consumed_at,
        created_at
      FROM auth_tokens
      WHERE token_hash = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
      [tokenHash, purpose]
    );

    const row = result.rows[0];

    return row ? this.mapAuthToken(row) : undefined;
  }

  async consume(
    id: string,
    client?: PoolClient
  ): Promise<AuthToken | undefined> {
    const result = await this.execute<AuthTokenRow>(
      "consumeAuthToken",
      client,
      `UPDATE auth_tokens
      SET consumed_at = NOW()
      WHERE id = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING
        id,
        user_id,
        purpose,
        expires_at,
        consumed_at,
        created_at`,
      [id]
    );

    const row = result.rows[0];

    return row ? this.mapAuthToken(row) : undefined;
  }

  async invalidateActiveByUserAndPurpose(
    userId: string,
    purpose: AuthTokenPurpose,
    client?: PoolClient
  ): Promise<number> {
    const result = await this.execute<AuthTokenIdRow>(
      "invalidateActiveAuthTokens",
      client,
      `UPDATE auth_tokens
      SET consumed_at = NOW()
      WHERE user_id = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id`,
      [userId, purpose]
    );

    return result.rowCount ?? 0;
  }
}
