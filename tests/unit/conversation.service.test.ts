import { describe, it, expect, vi, beforeEach } from "vitest";

import { ConversationService } from "../../src/conversations/conversation.service.js";

import type { ConversationRepository } from "../../src/conversations/conversation.repository.js";

import type {
  Conversation,
  ConversationMessage,
} from "../../src/conversations/conversation.types.js";

describe("Conversation Service", () => {
  let repository: ConversationRepository;
  let conversationService: ConversationService;

  let mockConversation: Conversation;

  beforeEach(() => {
    mockConversation = {
      id: "test-conversation-id",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    repository = {
      create: vi.fn().mockResolvedValue(mockConversation),
      findById: vi.fn().mockResolvedValue(mockConversation),
      addMessage: vi.fn().mockResolvedValue(mockConversation),
    };

    conversationService = new ConversationService(repository);
  });

  it("should create a new conversation", async () => {
    const conversation = await conversationService.createConversation();

    expect(repository.create).toHaveBeenCalledOnce();
    expect(conversation.id).toBeDefined();
    expect(conversation.messages).toEqual([]);
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(conversation.updatedAt).toBeInstanceOf(Date);
  });

  it("should retrieve an existing conversation", async () => {
    const conversation = await conversationService.getConversation(
      mockConversation.id
    );

    expect(repository.findById).toHaveBeenCalledWith(mockConversation.id);
    expect(conversation?.id).toBe(mockConversation.id);
  });

  it("should add a message to an existing conversation", async () => {
    const message: ConversationMessage = {
      role: "user",
      content: "Hello AgentMacArthur",
    };

    await conversationService.addMessage(mockConversation.id, message);

    expect(repository.addMessage).toHaveBeenCalledWith(
      mockConversation.id,
      message
    );
  });

  it("should return undefined for an invalid conversation ID", async () => {
    vi.mocked(repository.findById).mockResolvedValue(undefined);

    const conversation = await conversationService.getConversation(
      "invalid-id"
    );

    expect(conversation).toBeUndefined();
  });

  it("should preserve previous messages when adding new messages", async () => {
    const messages: ConversationMessage[] = [
      {
        role: "user",
        content: "My name is Alex.",
      },
      {
        role: "assistant",
        content: "Nice to meet you, Alex.",
      },
      {
        role: "user",
        content: "What is my name?",
      },
    ];

    for (const message of messages) {
      await conversationService.addMessage(mockConversation.id, message);
    }

    expect(repository.addMessage).toHaveBeenCalledTimes(3);

    expect(repository.addMessage).toHaveBeenNthCalledWith(
      1,
      mockConversation.id,
      messages[0]
    );

    expect(repository.addMessage).toHaveBeenNthCalledWith(
      2,
      mockConversation.id,
      messages[1]
    );

    expect(repository.addMessage).toHaveBeenNthCalledWith(
      3,
      mockConversation.id,
      messages[2]
    );
  });
});