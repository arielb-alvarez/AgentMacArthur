
import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { pool as defaultPool } from "../config/database.js";

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

  constructor(private readonly db: Pool = defaultPool) {}

  async create(): Promise<Conversation> {
    const id = randomUUID();

    const result = await this.db.query<ConversationRow>(
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
  }

  async findById(
    id: string
  ): Promise<Conversation | undefined> {
    const conversationResult = await this.db.query<ConversationRow>(
      `SELECT id, created_at, updated_at
       FROM conversations
       WHERE id = $1`,
      [id]
    );

    const conversationRow = conversationResult.rows[0];

    if (!conversationRow) {
      return undefined;
    }

    const messagesResult = await this.db.query<MessageRow>(
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
  }

  async addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<Conversation | undefined> {
    const client = await this.db.connect();

    try {
      await client.query("BEGIN");

      const conversationResult = await client.query(
        `UPDATE conversations
         SET updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [conversationId]
      );

      if (conversationResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return undefined;
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

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.findById(conversationId);
  }
}
