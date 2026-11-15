
import { describe, it, expect, vi } from "vitest";

import { AgentChatService } from "../../src/agent/agent-chat.service.js";

import type { AgentProvider } from "../../src/agent/agent-provider.js";
import type { ConversationService } from "../../src/conversations/conversation.service.js";
import type { Conversation } from "../../src/conversations/conversation.types.js";

describe("Agent Chat Service", () => {
  const createMockConversation = (
    messages: Conversation["messages"] = []
  ): Conversation => ({
    id: "test-conversation-id",
    messages,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("should create a conversation and generate a response", async () => {
    const initialConversation = createMockConversation();

    const userMessage = {
      role: "user" as const,
      content: "Hello AgentMacArthur",
    };

    const updatedConversation = createMockConversation([userMessage]);

    const completedConversation = createMockConversation([
      userMessage,
      {
        role: "assistant",
        content: "Hello from test provider",
      },
    ]);

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue(
        "Hello from test provider"
      ),
    };

    const fakeConversationService = {
      createConversation: vi.fn().mockResolvedValue(initialConversation),
      getConversation: vi.fn(),
      addMessage: vi.fn()
        .mockResolvedValueOnce(updatedConversation)
        .mockResolvedValueOnce(completedConversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    const result = await service.chat({
      message: "Hello AgentMacArthur",
    });

    expect(fakeConversationService.createConversation).toHaveBeenCalledOnce();

    expect(fakeConversationService.addMessage).toHaveBeenNthCalledWith(
      1,
      initialConversation.id,
      userMessage
    );

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledWith([
      userMessage,
    ]);

    expect(fakeConversationService.addMessage).toHaveBeenNthCalledWith(
      2,
      initialConversation.id,
      {
        role: "assistant",
        content: "Hello from test provider",
      }
    );

    expect(result).toEqual({
      conversationId: initialConversation.id,
      response: "Hello from test provider",
    });
  });

  it("should continue an existing conversation", async () => {
    const existingConversation = createMockConversation([
      {
        role: "user",
        content: "My name is Alex.",
      },
      {
        role: "assistant",
        content: "Hello Alex.",
      },
    ]);

    const updatedConversation = createMockConversation([
      ...existingConversation.messages,
      {
        role: "user",
        content: "What is my name?",
      },
    ]);

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue("Your name is Alex."),
    };

    const fakeConversationService = {
      createConversation: vi.fn(),
      getConversation: vi.fn().mockResolvedValue(existingConversation),
      addMessage: vi.fn()
        .mockResolvedValueOnce(updatedConversation)
        .mockResolvedValueOnce(updatedConversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    const result = await service.chat({
      message: "What is my name?",
      conversationId: existingConversation.id,
    });

    expect(fakeConversationService.getConversation).toHaveBeenCalledWith(
      existingConversation.id
    );

    expect(fakeConversationService.createConversation).not.toHaveBeenCalled();

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledWith(
      updatedConversation.messages
    );

    expect(result.conversationId).toBe(existingConversation.id);
  });

  it("should throw a 404 error when the conversation does not exist", async () => {
    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn(),
    };

    const fakeConversationService = {
      createConversation: vi.fn(),
      getConversation: vi.fn().mockResolvedValue(undefined),
      addMessage: vi.fn(),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat({
        message: "Hello",
        conversationId: "missing-conversation-id",
      })
    ).rejects.toMatchObject({
      message: "Conversation not found.",
      statusCode: 404,
    });

    expect(fakeProvider.generateChatResponse).not.toHaveBeenCalled();
    expect(fakeConversationService.addMessage).not.toHaveBeenCalled();
  });

  it("should stop if saving the user message fails", async () => {
    const conversation = createMockConversation();

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn(),
    };

    const fakeConversationService = {
      createConversation: vi.fn().mockResolvedValue(conversation),
      getConversation: vi.fn(),
      addMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat({ message: "Hello" })
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(fakeProvider.generateChatResponse).not.toHaveBeenCalled();
  });

  it("should propagate AI provider errors", async () => {
    const conversation = createMockConversation();

    const userMessage = {
      role: "user" as const,
      content: "Hello",
    };

    const updatedConversation = createMockConversation([userMessage]);

    const providerError = new Error("AI provider failed");

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockRejectedValue(providerError),
    };

    const fakeConversationService = {
      createConversation: vi.fn().mockResolvedValue(conversation),
      getConversation: vi.fn(),
      addMessage: vi.fn().mockResolvedValue(updatedConversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat({ message: "Hello" })
    ).rejects.toBe(providerError);

    expect(fakeConversationService.addMessage).toHaveBeenCalledOnce();
  });

  it("should throw when saving the assistant response fails", async () => {
    const conversation = createMockConversation();

    const updatedConversation = createMockConversation([
        {
        role: "user",
        content: "Hello",
        },
    ]);

    const fakeProvider: AgentProvider = {
        generateChatResponse: vi.fn().mockResolvedValue("Hello there!"),
    };

    const fakeConversationService = {
        createConversation: vi.fn().mockResolvedValue(conversation),
        getConversation: vi.fn(),
        addMessage: vi.fn()
        .mockResolvedValueOnce(updatedConversation)
        .mockResolvedValueOnce(undefined),
    } as unknown as ConversationService;

    const service = new AgentChatService(
        fakeProvider,
        fakeConversationService
    );

    await expect(
        service.chat({ message: "Hello" })
    ).rejects.toMatchObject({
        message: "Conversation could not be updated.",
        statusCode: 404,
    });

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledOnce();
    expect(fakeConversationService.addMessage).toHaveBeenCalledTimes(2);
  });
});
