
import { describe, it, expect } from "vitest";
import { mockAgentProvider } from "../../src/services/mock-agent.service.js";
import type { ConversationMessage } from "../../src/conversations/conversation.types.js";

describe("mockAgentProvider", () => {
  it.each([
    "Hello AgentMacArthur",
    "Can you review my TypeScript code?",
    "Testing 123",
    "This is another test message.",
  ])("should return the expected response for: %s", async (message) => {
    const messages: ConversationMessage[] = [
      {
        role: "user",
        content: message,
      },
    ];

    const result = await mockAgentProvider.generateChatResponse(messages);

    expect(result).toBe(
      `[MOCK RESPONSE] AgentMacArthur received your message: "${message}". Total messages in conversation: 1.`
    );
  });
});
