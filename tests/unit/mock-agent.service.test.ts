import { describe, it, expect } from "vitest";
import { mockAgentProvider } from "../../src/services/mock-agent.service.js";

describe("mockAgentProvider", () => {
  it.each([
    "Hello AgentMacArthur",
    "Can you review my TypeScript code?",
    "Testing 123",
    "This is another test message.",
  ])("should return the expected response for: %s", async (message) => {
    const result = await mockAgentProvider.generateChatResponse(message);

    expect(result).toBe(
      `[MOCK RESPONSE] Hello! AgentMacArthur received your message: "${message}". This is a simulated response because the application is currently running in mock mode.`
    );
  });
});