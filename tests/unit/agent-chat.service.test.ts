import {
  describe,
  it,
  expect,
  vi,
} from "vitest";

import { AgentChatService } from "../../src/agent/agent-chat.service.js";

import type { AgentProvider } from "../../src/agent/agent-provider.js";
import type { ConversationService } from "../../src/conversations/conversation.service.js";

import type {
  Conversation,
  ConversationMessage,
} from "../../src/conversations/conversation.types.js";

const userId = "authenticated-user-id";

const createMockConversation = (
  messages: ConversationMessage[] = [],
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: "test-conversation-id",
  createdBy: userId,
  scope: "personal",
  organizationId: null,
  projectId: null,
  title: null,
  status: "active",
  messages,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("AgentChatService", () => {
  it("creates a personal conversation and generates a response", async () => {
    const userMessage: ConversationMessage = {
      role: "user",
      content: "Hello AgentMacArthur",
    };

    const conversation = createMockConversation([userMessage]);

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue(
        "Hello from test provider"
      ),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn().mockResolvedValue(
        createMockConversation([
          userMessage,
          {
            role: "assistant",
            content: "Hello from test provider",
          },
        ])
      ),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    const result = await service.chat(userId, {
      message: "Hello AgentMacArthur",
      scope: "personal",
    });

    expect(fakeConversationService.startTurn).toHaveBeenCalledWith(
      userId,
      {
        createdBy: userId,
        scope: "personal",
      },
      userMessage
    );

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledWith([
      userMessage,
    ]);

    expect(fakeConversationService.completeTurn).toHaveBeenCalledWith(
      conversation.id,
      userId,
      {
        role: "assistant",
        content: "Hello from test provider",
      }
    );

    expect(result).toEqual({
      conversationId: conversation.id,
      response: "Hello from test provider",
    });
  });

  it("creates an organization conversation", async () => {
    const conversation = createMockConversation([], {
      scope: "organization",
      organizationId: "organization-123",
    });

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue("Organization response"),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn().mockResolvedValue(conversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await service.chat(userId, {
      message: "Organization question",
      scope: "organization",
      organizationId: "organization-123",
    });

    expect(fakeConversationService.startTurn).toHaveBeenCalledWith(
      userId,
      {
        createdBy: userId,
        scope: "organization",
        organizationId: "organization-123",
      },
      {
        role: "user",
        content: "Organization question",
      }
    );
  });

  it("creates a project conversation", async () => {
    const conversation = createMockConversation([], {
      scope: "project",
      organizationId: "organization-123",
      projectId: "project-123",
    });

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue("Project response"),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn().mockResolvedValue(conversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await service.chat(userId, {
      message: "Project question",
      scope: "project",
      organizationId: "organization-123",
      projectId: "project-123",
    });

    expect(fakeConversationService.startTurn).toHaveBeenCalledWith(
      userId,
      {
        createdBy: userId,
        scope: "project",
        organizationId: "organization-123",
        projectId: "project-123",
      },
      {
        role: "user",
        content: "Project question",
      }
    );
  });

  it("continues an existing conversation using its stored history", async () => {
    const previousMessages: ConversationMessage[] = [
      {
        role: "user",
        content: "My name is Alex.",
      },
      {
        role: "assistant",
        content: "Hello Alex.",
      },
    ];

    const userMessage: ConversationMessage = {
      role: "user",
      content: "What is my name?",
    };

    const conversation = createMockConversation([
      ...previousMessages,
      userMessage,
    ]);

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue("Your name is Alex."),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn().mockResolvedValue(conversation),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    const result = await service.chat(userId, {
      message: "What is my name?",
      conversationId: conversation.id,
    });

    expect(fakeConversationService.startTurn).toHaveBeenCalledWith(
      userId,
      {
        conversationId: conversation.id,
      },
      userMessage
    );

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledWith([
      ...previousMessages,
      userMessage,
    ]);

    expect(fakeConversationService.completeTurn).toHaveBeenCalledWith(
      conversation.id,
      userId,
      {
        role: "assistant",
        content: "Your name is Alex.",
      }
    );

    expect(result.conversationId).toBe(conversation.id);
  });

  it("does not call the provider when starting the conversation fails", async () => {
    const authorizationError = new Error("Access denied");

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn(),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockRejectedValue(authorizationError),
      completeTurn: vi.fn(),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat(userId, {
        message: "Unauthorized request",
        scope: "personal",
      })
    ).rejects.toBe(authorizationError);

    expect(fakeProvider.generateChatResponse).not.toHaveBeenCalled();
    expect(fakeConversationService.completeTurn).not.toHaveBeenCalled();
  });

  it("propagates AI provider errors without saving an assistant response", async () => {
    const conversation = createMockConversation([
      {
        role: "user",
        content: "Hello",
      },
    ]);

    const providerError = new Error("AI provider failed");

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockRejectedValue(providerError),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn(),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat(userId, {
        message: "Hello",
        scope: "personal",
      })
    ).rejects.toBe(providerError);

    expect(fakeConversationService.startTurn).toHaveBeenCalledOnce();
    expect(fakeConversationService.completeTurn).not.toHaveBeenCalled();
  });

  it("propagates errors when saving the assistant response fails", async () => {
    const conversation = createMockConversation([
      {
        role: "user",
        content: "Hello",
      },
    ]);

    const persistenceError = new Error("Permission revoked");

    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue("Hello there!"),
    };

    const fakeConversationService = {
      startTurn: vi.fn().mockResolvedValue(conversation),
      completeTurn: vi.fn().mockRejectedValue(persistenceError),
    } as unknown as ConversationService;

    const service = new AgentChatService(
      fakeProvider,
      fakeConversationService
    );

    await expect(
      service.chat(userId, {
        message: "Hello",
        scope: "personal",
      })
    ).rejects.toBe(persistenceError);

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledOnce();
    expect(fakeConversationService.completeTurn).toHaveBeenCalledOnce();
  });
});
