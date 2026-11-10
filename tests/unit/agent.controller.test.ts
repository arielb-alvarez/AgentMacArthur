
import { describe, it, expect, vi } from "vitest";
import { createAgentController } from "../../src/controllers/agent.controller.js";
import type { AgentProvider } from "../../src/agent/agent-provider.js";

describe("Agent Controller", () => {
  it("should return a successful response", async () => {
    // 1. Create a fake provider
    const fakeProvider: AgentProvider = {
      generateChatResponse: vi.fn().mockResolvedValue(
        "Hello from test provider"
      ),
    };

    // 2. Create the controller using the fake provider
    const controller = createAgentController(fakeProvider);

    // 3. Mock the request
    const req = {
      body: {
        message: "Hello AgentMacArthur",
      },
    } as any;

    // 4. Mock the response
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    // 5. Mock the next function
    const next = vi.fn();

    // 6. Execute the controller
    await controller.chat(req, res, next);

    // 7. Verify the results
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
      conversationId: expect.any(String),
      response: "Hello from test provider",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("should forward provider errors to next middleware", async () => {
    const providerError = new Error("AI provider failed");

    const failingProvider: AgentProvider = {
        generateChatResponse: vi.fn().mockRejectedValue(providerError),
    };

    const controller = createAgentController(failingProvider);

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
