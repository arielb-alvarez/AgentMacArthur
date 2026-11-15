import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mockEnv, mockCreate, mockConstructor } = vi.hoisted(() => ({
  mockEnv: {
    OPENAI_API_KEY: "sk-test-key",
    OPENAI_MODEL: "gpt-test-model",
  },
  mockCreate: vi.fn(),
  mockConstructor: vi.fn(),
}));

vi.mock("../../src/config/env.js", () => ({
  env: mockEnv,
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = {
      create: mockCreate,
    };

    constructor(options: { apiKey: string }) {
      mockConstructor(options);
    }
  },
}));

import { openAIAgentProvider } from "../../src/services/agent.service.js";
import type { ConversationMessage } from "../../src/conversations/conversation.types.js";

describe("openAIAgentProvider", () => {
  beforeEach(() => {
    mockEnv.OPENAI_API_KEY = "sk-test-key";
    mockEnv.OPENAI_MODEL = "gpt-test-model";

    mockCreate.mockReset();
    mockConstructor.mockReset();
  });

  it("should generate a response successfully", async () => {
    const messages: ConversationMessage[] = [
      {
        role: "user",
        content: "Hello AgentMacArthur",
      },
    ];

    mockCreate.mockResolvedValue({
      output_text: "Hello! How can I help?",
    });

    const result =
      await openAIAgentProvider.generateChatResponse(messages);

    expect(result).toBe("Hello! How can I help?");

    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: "sk-test-key",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: "gpt-test-model",
      instructions:
        "You are AgentMacArthur, an AI software engineering assistant. You help developers understand, build, debug, and improve software.",
      input: messages,
    });
  });

  it("should reject requests when the API key is missing", async () => {
    mockEnv.OPENAI_API_KEY = "";

    await expect(
      openAIAgentProvider.generateChatResponse([])
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "OPENAI_API_KEY is not configured.",
    });

    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it("should return a service unavailable error when OpenAI fails", async () => {
    mockCreate.mockRejectedValue(new Error("Upstream API failure"));

    await expect(
      openAIAgentProvider.generateChatResponse([])
    ).rejects.toMatchObject({
      statusCode: 503,
      message:
        "Our AI service is temporarily unavailable. Please try again later.",
    });
  });
});
