import type { AgentProvider } from "../agent/agent-provider.js";

export const mockAgentProvider: AgentProvider = {
  generateChatResponse: async (messages) => {
    const latestMessage = messages[messages.length - 1];

    return `[MOCK RESPONSE] AgentMacArthur received your message: "${latestMessage?.content ?? ""}". Total messages in conversation: ${messages.length}.`;
  },
};
