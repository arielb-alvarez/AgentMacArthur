import { describe, it, expect, vi } from "vitest";

import { createAgentController } from "../../src/controllers/agent.controller.js";
import type { AgentChatService } from "../../src/agent/agent-chat.service.js";

describe("Agent Controller", () => {
  it("should return a successful response", async () => {
    const chatMock = vi.fn().mockResolvedValue({
      conversationId: "test-conversation-id",
      response: "Hello from test provider",
    });

    const fakeAgentChatService = {
      chat: chatMock,
    } as unknown as AgentChatService;

    const controller = createAgentController(fakeAgentChatService);

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

    expect(chatMock).toHaveBeenCalledOnce();
    expect(chatMock).toHaveBeenCalledWith({
      message: "Hello AgentMacArthur",
    });

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

    const fakeAgentChatService = {
      chat: vi.fn().mockRejectedValue(serviceError),
    } as unknown as AgentChatService;

    const controller = createAgentController(fakeAgentChatService);

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

    expect(next).toHaveBeenCalledWith(serviceError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
