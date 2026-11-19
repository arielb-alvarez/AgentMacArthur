import type { PoolClient } from "pg";

import type {
  Conversation,
  ConversationMessage,
  CreateConversationInput,
} from "./conversation.types.js";

export interface ConversationRepository {
  create(
    input: CreateConversationInput,
    client: PoolClient
  ): Promise<Conversation>;

  findById(
    id: string,
    client: PoolClient
  ): Promise<Conversation | undefined>;

  findByIdForUpdate(
    id: string,
    client: PoolClient
  ): Promise<Conversation | undefined>;

  addMessage(
    conversationId: string,
    message: ConversationMessage,
    client: PoolClient
  ): Promise<Conversation | undefined>;
}
