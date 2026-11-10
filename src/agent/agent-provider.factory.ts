import { env } from "../config/env.js";
import type { AgentProvider } from "./agent-provider.js";

import { mockAgentProvider } from "../services/mock-agent.service.js";
import { openAIAgentProvider } from "../services/agent.service.js";

export const getAgentProvider = (): AgentProvider => {
  switch (env.AGENT_PROVIDER) {
    case "openai":
      return openAIAgentProvider;

    case "mock":
    default:
      return mockAgentProvider;
  }
};