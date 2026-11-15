import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { pool as defaultPool } from "../config/database.js";
import {
  PostgresTransactionManager,
  type TransactionManager,
} from "../database/transaction-manager.js";

import type { SessionRepository } from "./session.repository.js";

import type {
  CreateSessionInput,
  Session,
} from "./session.types.js";

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export class PostgresSessionRepository
  implements SessionRepository
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

  private mapSession(row: SessionRow): Session {
    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  async create(
    input: CreateSessionInput,
    client?: PoolClient
  ): Promise<Session> {
    return this.execute(
      "createSession",
      async (connection) => {
        const result = await connection.query<SessionRow>(
          `INSERT INTO sessions (
            id,
            user_id,
            token_hash,
            expires_at
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            user_id,
            expires_at,
            last_used_at,
            revoked_at,
            created_at`,
          [
            randomUUID(),
            input.userId,
            input.tokenHash,
            input.expiresAt,
          ]
        );

        return this.mapSession(result.rows[0]!);
      },
      client
    );
  }

  async findActiveByTokenHash(
    tokenHash: string,
    client?: PoolClient
  ): Promise<Session | undefined> {
    return this.execute(
      "findActiveSessionByTokenHash",
      async (connection) => {
        const result = await connection.query<SessionRow>(
          `SELECT
            id,
            user_id,
            expires_at,
            last_used_at,
            revoked_at,
            created_at
          FROM sessions
          WHERE token_hash = $1
            AND revoked_at IS NULL
            AND expires_at > NOW()
          LIMIT 1`,
          [tokenHash]
        );

        const row = result.rows[0];

        return row ? this.mapSession(row) : undefined;
      },
      client
    );
  }

  async updateLastUsed(
    id: string,
    client?: PoolClient
  ): Promise<Session | undefined> {
    return this.execute(
      "updateSessionLastUsed",
      async (connection) => {
        const result = await connection.query<SessionRow>(
          `UPDATE sessions
          SET last_used_at = NOW()
          WHERE id = $1
            AND revoked_at IS NULL
            AND expires_at > NOW()
          RETURNING
            id,
            user_id,
            expires_at,
            last_used_at,
            revoked_at,
            created_at`,
          [id]
        );

        const row = result.rows[0];

        return row ? this.mapSession(row) : undefined;
      },
      client
    );
  }

  async revoke(
    id: string,
    client?: PoolClient
  ): Promise<Session | undefined> {
    return this.execute(
      "revokeSession",
      async (connection) => {
        const result = await connection.query<SessionRow>(
          `UPDATE sessions
          SET revoked_at = NOW()
          WHERE id = $1
            AND revoked_at IS NULL
          RETURNING
            id,
            user_id,
            expires_at,
            last_used_at,
            revoked_at,
            created_at`,
          [id]
        );

        const row = result.rows[0];

        return row ? this.mapSession(row) : undefined;
      },
      client
    );
  }

  async revokeAllByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<number> {
    return this.execute(
      "revokeAllUserSessions",
      async (connection) => {
        const result = await connection.query(
          `UPDATE sessions
          SET revoked_at = NOW()
          WHERE user_id = $1
            AND revoked_at IS NULL
          RETURNING id`,
          [userId]
        );

        return result.rowCount ?? 0;
      },
      client
    );
  }
}
