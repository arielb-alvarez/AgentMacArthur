import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockAgentProviders } = vi.hoisted(() => ({
  mockEnv: {
    AGENT_PROVIDER: "mock",
  },
  mockAgentProviders: {
    mock: { name: "mock-provider" },
    openai: { name: "openai-provider" },
  },
}));

vi.mock("../../src/config/env.js", () => ({
  env: mockEnv,
}));

vi.mock("../../src/services/mock-agent.service.js", () => ({
  mockAgentProvider: mockAgentProviders.mock,
}));

vi.mock("../../src/services/agent.service.js", () => ({
  openAIAgentProvider: mockAgentProviders.openai,
}));

import { getAgentProvider } from "../../src/agent/agent-provider.factory.js";

describe("getAgentProvider", () => {
  beforeEach(() => {
    mockEnv.AGENT_PROVIDER = "mock";
  });

  it("should return the mock provider when configured", () => {
    mockEnv.AGENT_PROVIDER = "mock";

    expect(getAgentProvider()).toBe(mockAgentProviders.mock);
  });

  it("should return the OpenAI provider when configured", () => {
    mockEnv.AGENT_PROVIDER = "openai";

    expect(getAgentProvider()).toBe(mockAgentProviders.openai);
  });

  it("should default to the mock provider for an unknown value", () => {
    mockEnv.AGENT_PROVIDER = "unknown";

    expect(getAgentProvider()).toBe(mockAgentProviders.mock);
  });
});
