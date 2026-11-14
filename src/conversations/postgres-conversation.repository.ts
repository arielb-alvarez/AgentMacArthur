import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

import type {
  Conversation,
  ConversationMessage,
} from "./conversation.types.js";

import type {
  ConversationRepository,
} from "./conversation.repository.js";

interface ConversationRow {
  id: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  role: ConversationMessage["role"];
  content: string;
}

export class PostgresConversationRepository
  implements ConversationRepository {

  constructor(
    private readonly db: Pool = defaultPool,
    private readonly queryTimeoutMs: number = env.DB_QUERY_TIMEOUT_MS,
    private readonly slowQueryThresholdMs: number =
      env.DB_SLOW_QUERY_THRESHOLD_MS
  ) {}

  private async withQueryTimeout<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const startedAt = process.hrtime.bigint();

    const client = await this.db.connect();
    let releaseError: Error | undefined;

    try {
      await client.query("BEGIN");

      await client.query(
        "SELECT set_config('statement_timeout', $1, true)",
        [`${this.queryTimeoutMs}ms`]
      );

      const result = await operation(client);

      await client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back database transaction");
      }

      throw error;
    } finally {
      client.release(releaseError);

      const durationMs = Number(
        (
          Number(process.hrtime.bigint() - startedAt) / 1_000_000
        ).toFixed(2)
      );

      if (durationMs >= this.slowQueryThresholdMs) {
        logger.warn("Slow database operation detected", {
          operation: operationName,
          durationMs,
          thresholdMs: this.slowQueryThresholdMs,
        });
      }
    }
  }

  async create(): Promise<Conversation> {
    return this.withQueryTimeout("create", async (client) => {
      const id = randomUUID();

      const result = await client.query<ConversationRow>(
        `INSERT INTO conversations (id)
         VALUES ($1)
         RETURNING id, created_at, updated_at`,
        [id]
      );

      const row = result.rows[0];

      return {
        id: row.id,
        messages: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async findById(
    id: string
  ): Promise<Conversation | undefined> {
    return this.withQueryTimeout("findById", async (client) => {
      const conversationResult = await client.query<ConversationRow>(
        `SELECT id, created_at, updated_at
         FROM conversations
         WHERE id = $1`,
        [id]
      );

      const conversationRow = conversationResult.rows[0];

      if (!conversationRow) {
        return undefined;
      }

      const messagesResult = await client.query<MessageRow>(
        `SELECT role, content
         FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY message_order ASC`,
        [id]
      );

      const messages: ConversationMessage[] =
        messagesResult.rows.map((row) => ({
          role: row.role,
          content: row.content,
        }));

      return {
        id: conversationRow.id,
        messages,
        createdAt: conversationRow.created_at,
        updatedAt: conversationRow.updated_at,
      };
    });
  }

  async addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<Conversation | undefined> {
    const updated = await this.withQueryTimeout(
      "addMessage",
      async (client) => {
        const conversationResult = await client.query(
          `UPDATE conversations
         SET updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
          [conversationId]
        );

        if (conversationResult.rowCount === 0) {
          return false;
        }

        await client.query(
          `INSERT INTO conversation_messages
         (id, conversation_id, role, content)
         VALUES ($1, $2, $3, $4)`,
          [
            randomUUID(),
            conversationId,
            message.role,
            message.content,
          ]
        );

        return true;
      });

    if (!updated) {
      return undefined;
    }

    return this.findById(conversationId);
  }
}
