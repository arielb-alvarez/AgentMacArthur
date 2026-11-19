import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import type {
  Conversation,
  ConversationMessage,
  ConversationScope,
  ConversationStatus,
  CreateConversationInput,
} from "./conversation.types.js";

import type {
  ConversationRepository,
} from "./conversation.repository.js";

interface ConversationRow {
  id: string;
  created_by: string | null;
  scope: ConversationScope;
  organization_id: string | null;
  project_id: string | null;
  title: string | null;
  status: ConversationStatus;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  role: ConversationMessage["role"];
  content: string;
}

export class PostgresConversationRepository
  implements ConversationRepository
{
  private async findByIdWithClient(
    id: string,
    client: PoolClient,
    forUpdate = false
  ): Promise<Conversation | undefined> {
    const conversationResult = await client.query<ConversationRow>(
      `SELECT
         id,
         created_by,
         scope,
         organization_id,
         project_id,
         title,
         status,
         created_at,
         updated_at
       FROM conversations
       WHERE id = $1
       ${forUpdate ? "FOR UPDATE" : ""}`,
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
      createdBy: conversationRow.created_by,
      scope: conversationRow.scope,
      organizationId: conversationRow.organization_id,
      projectId: conversationRow.project_id,
      title: conversationRow.title,
      status: conversationRow.status,
      messages,
      createdAt: conversationRow.created_at,
      updatedAt: conversationRow.updated_at,
    };
  }

  async create(
    input: CreateConversationInput,
    client: PoolClient
  ): Promise<Conversation> {
    const id = randomUUID();

    const result = await client.query<ConversationRow>(
      `INSERT INTO conversations (
         id,
         created_by,
         scope,
         organization_id,
         project_id,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING
         id,
         created_by,
         scope,
         organization_id,
         project_id,
         title,
         status,
         created_at,
         updated_at`,
      [
        id,
        input.createdBy,
        input.scope,
        input.scope === "personal" ? null : input.organizationId,
        input.scope === "project" ? input.projectId : null,
      ]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      createdBy: row.created_by,
      scope: row.scope,
      organizationId: row.organization_id,
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      messages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findById(
    id: string,
    client: PoolClient
  ): Promise<Conversation | undefined> {
    return this.findByIdWithClient(id, client);
  }

  async findByIdForUpdate(
    id: string,
    client: PoolClient
  ): Promise<Conversation | undefined> {
    return this.findByIdWithClient(id, client, true);
  }

  async addMessage(
    conversationId: string,
    message: ConversationMessage,
    client: PoolClient
  ): Promise<Conversation | undefined> {
    const conversationResult = await client.query(
      `UPDATE conversations
       SET updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [conversationId]
    );

    if (conversationResult.rowCount === 0) {
      return undefined;
    }

    await client.query(
      `INSERT INTO conversation_messages (
         id,
         conversation_id,
         role,
         content
       )
       VALUES ($1, $2, $3, $4)`,
      [
        randomUUID(),
        conversationId,
        message.role,
        message.content,
      ]
    );

    return this.findByIdWithClient(conversationId, client);
  }
}
