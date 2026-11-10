
import type {
  Conversation,
  ConversationMessage,
} from "./conversation.types.js";

export interface ConversationRepository {
  create(): Promise<Conversation>;

  findById(id: string): Promise<Conversation | undefined>;

  addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<Conversation | undefined>;
}
