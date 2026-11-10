import type {
  Conversation,
  ConversationMessage,
} from "./conversation.types.js";

import type {
  ConversationRepository,
} from "./conversation.repository.js";

export class ConversationService {
  constructor(
    private readonly repository: ConversationRepository
  ) {}

  async createConversation(): Promise<Conversation> {
    return this.repository.create();
  }

  async getConversation(
    conversationId: string
  ): Promise<Conversation | undefined> {
    return this.repository.findById(conversationId);
  }

  async addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<Conversation | undefined> {
    return this.repository.addMessage(conversationId, message);
  }
}