
import type {
  Conversation,
  ConversationMessage,
} from "./conversation.types.js";

// Temporary in-memory conversation storage
const conversations = new Map<string, Conversation>();

export const conversationService = {
  // Create a new conversation
  createConversation: (): Conversation => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    conversations.set(conversation.id, conversation);

    return conversation;
  },

  // Retrieve a conversation by ID
  getConversation: (conversationId: string): Conversation | undefined => {
    return conversations.get(conversationId);
  },

  // Add a message to an existing conversation
  addMessage: (
    conversationId: string,
    message: ConversationMessage
  ): Conversation | undefined => {
    const conversation = conversations.get(conversationId);

    if (!conversation) {
      return undefined;
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date();

    return conversation;
  },
};
