import { describe, it, expect, vi } from "vitest";

import { createAgentController } from "../../src/controllers/agent.controller.js";

import type { AgentProvider } from "../../src/agent/agent-provider.js";
import type { ConversationService } from "../../src/conversations/conversation.service.js";
import type { Conversation } from "../../src/conversations/conversation.types.js";

describe("Agent Controller", () => {
  const createMockConversation = (): Conversation => ({
    id: "test-conversation-id",
    messages: [
      {
        role: "user",
        content: "Hello AgentMacArthur",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("should return a successful response", async () => {
    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue(
        "Hello from test provider"
      ),
    };

    const mockConversation = createMockConversation();

    const fakeConversationService = {
      createConversation: vi.fn().mockResolvedValue(mockConversation),
      getConversation: vi.fn().mockResolvedValue(mockConversation),
      addMessage: vi.fn().mockResolvedValue(mockConversation),
    } as unknown as ConversationService;

    const controller = createAgentController(
      fakeProvider,
      fakeConversationService
    );

    const req = {
      body: {
        message: "Hello AgentMacArthur",
      },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();

    await controller.chat(req, res, next);

    expect(fakeConversationService.createConversation).toHaveBeenCalledOnce();

    expect(fakeConversationService.addMessage).toHaveBeenCalledWith(
      mockConversation.id,
      {
        role: "user",
        content: "Hello AgentMacArthur",
      }
    );

    expect(fakeProvider.generateChatResponse).toHaveBeenCalledWith([
      {
        role: "user",
        content: "Hello AgentMacArthur",
      },
    ]);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      agent: "AgentMacArthur",
      conversationId: mockConversation.id,
      response: "Hello from test provider",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("should forward provider errors to next middleware", async () => {
    const providerError = new Error("AI provider failed");

    const failingProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockRejectedValue(providerError),
    };

    const mockConversation = createMockConversation();

    const fakeConversationService = {
      createConversation: vi.fn().mockResolvedValue(mockConversation),
      getConversation: vi.fn().mockResolvedValue(mockConversation),
      addMessage: vi.fn().mockResolvedValue(mockConversation),
    } as unknown as ConversationService;

    const controller = createAgentController(
      failingProvider,
      fakeConversationService
    );

    const req = {
      body: {
        message: "Hello AgentMacArthur",
      },
    } as any;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();

    await controller.chat(req, res, next);

    expect(next).toHaveBeenCalledWith(providerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});