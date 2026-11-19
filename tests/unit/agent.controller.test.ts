import { describe, it, expect, vi } from "vitest";

import { createAgentController } from "../../src/controllers/agent.controller.js";
import type { AgentChatService } from "../../src/agent/agent-chat.service.js";

describe("Agent Controller", () => {
  const authenticatedUserId = "test-user-id";

  const createAuthenticatedRequest = () =>
    ({
      auth: {
        user: {
          id: authenticatedUserId,
        },
      },
      body: {
        message: "Hello AgentMacArthur",
      },
    }) as any;

  it("should return a successful response", async () => {
    const chatMock = vi.fn().mockResolvedValue({
      conversationId: "test-conversation-id",
      response: "Hello from test provider",
    });

    const fakeAgentChatService = {
      chat: chatMock,
    } as unknown as AgentChatService;

    const controller = createAgentController(fakeAgentChatService);

    const req = createAuthenticatedRequest();

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();

    await controller.chat(req, res, next);

    expect(chatMock).toHaveBeenCalledOnce();
    expect(chatMock).toHaveBeenCalledWith(
      authenticatedUserId,
      {
        message: "Hello AgentMacArthur",
      }
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      agent: "AgentMacArthur",
      conversationId: "test-conversation-id",
      response: "Hello from test provider",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("should forward service errors to next middleware", async () => {
    const serviceError = new Error("Agent chat failed");

    const chatMock = vi.fn().mockRejectedValue(serviceError);

    const fakeAgentChatService = {
      chat: chatMock,
    } as unknown as AgentChatService;

    const controller = createAgentController(fakeAgentChatService);

    const req = createAuthenticatedRequest();

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();

    await controller.chat(req, res, next);

    expect(chatMock).toHaveBeenCalledOnce();
    expect(chatMock).toHaveBeenCalledWith(
      authenticatedUserId,
      {
        message: "Hello AgentMacArthur",
      }
    );

    expect(next).toHaveBeenCalledWith(serviceError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
