
import { afterEach, describe, expect, it, vi } from "vitest";

const defaultEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  PORT: "3000",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4.1-mini",
  AGENT_PROVIDER: "mock",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USER: "postgres",
  DB_PASSWORD: "test-password",
  DB_NAME: "agentmacarthur_test_runner",
  DB_TEST_NAME: "agentmacarthur_test_runner_test",
};

const loadEnv = async (
  overrides: Record<string, string | undefined> = {}
) => {
  vi.resetModules();

  const values = {
    ...defaultEnv,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }

  const { env } = await import("../../src/config/env.js");

  return env;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Environment configuration", () => {
  it("should load valid mock provider configuration", async () => {
    const env = await loadEnv();

    expect(env.AGENT_PROVIDER).toBe("mock");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DB_PASSWORD).toBe("test-password");
  });

  it("should accept a valid OpenAI configuration", async () => {
    const env = await loadEnv({
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-valid-key",
    });

    expect(env.AGENT_PROVIDER).toBe("openai");
    expect(env.OPENAI_API_KEY).toBe("sk-test-valid-key");
  });

  it("should reject OpenAI configuration without an API key", async () => {
    await expect(
      loadEnv({
        AGENT_PROVIDER: "openai",
      })
    ).rejects.toThrow("OPENAI_API_KEY is required");
  });

  it("should reject placeholder OpenAI API keys", async () => {
    await expect(
      loadEnv({
        AGENT_PROVIDER: "openai",
        OPENAI_API_KEY: "your_api_key_here",
      })
    ).rejects.toThrow("A valid OpenAI API key must be provided");
  });

  it("should treat an empty API key as missing", async () => {
    await expect(
      loadEnv({
        AGENT_PROVIDER: "openai",
        OPENAI_API_KEY: "   ",
      })
    ).rejects.toThrow("OPENAI_API_KEY is required");
  });

  it("should reject ports outside the valid range", async () => {
    await expect(
      loadEnv({
        PORT: "70000",
      })
    ).rejects.toThrow("PORT");
  });

  it("should reject identical development and test database names", async () => {
    await expect(
      loadEnv({
        DB_NAME: "same_database",
        DB_TEST_NAME: "same_database",
      })
    ).rejects.toThrow("DB_TEST_NAME must be different");
  });
});
