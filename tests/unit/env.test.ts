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

  it("should use default database pool settings", async () => {
    const env = await loadEnv();

    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.DB_IDLE_TIMEOUT_MS).toBe(30000);
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
  });

  it("should use the default slow query threshold", async () => {
    const env = await loadEnv();

    expect(env.DB_SLOW_QUERY_THRESHOLD_MS).toBe(1000);
  });

  it("should accept a custom slow query threshold", async () => {
    const env = await loadEnv({
      DB_SLOW_QUERY_THRESHOLD_MS: "2000",
    });

    expect(env.DB_SLOW_QUERY_THRESHOLD_MS).toBe(2000);
  });

  it("should reject an invalid slow query threshold", async () => {
    await expect(
      loadEnv({
        DB_SLOW_QUERY_THRESHOLD_MS: "0",
      })
    ).rejects.toThrow("DB_SLOW_QUERY_THRESHOLD_MS");
  });

  it("should reject an excessive slow query threshold", async () => {
    await expect(
      loadEnv({
        DB_SLOW_QUERY_THRESHOLD_MS: "300001",
      })
    ).rejects.toThrow("DB_SLOW_QUERY_THRESHOLD_MS");
  });

  it("should accept custom database pool settings", async () => {
    const env = await loadEnv({
      DB_POOL_MAX: "20",
      DB_IDLE_TIMEOUT_MS: "60000",
      DB_CONNECTION_TIMEOUT_MS: "10000",
    });

    expect(env.DB_POOL_MAX).toBe(20);
    expect(env.DB_IDLE_TIMEOUT_MS).toBe(60000);
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(10000);
  });

  it("should accept zero timeout values", async () => {
    const env = await loadEnv({
      DB_IDLE_TIMEOUT_MS: "0",
      DB_CONNECTION_TIMEOUT_MS: "0",
    });

    expect(env.DB_IDLE_TIMEOUT_MS).toBe(0);
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(0);
  });

  it("should reject an invalid database pool maximum", async () => {
    await expect(
      loadEnv({ DB_POOL_MAX: "0" })
    ).rejects.toThrow("DB_POOL_MAX");
  });

  it("should reject an excessive database pool maximum", async () => {
    await expect(
      loadEnv({ DB_POOL_MAX: "101" })
    ).rejects.toThrow("DB_POOL_MAX");
  });

  it("should reject an invalid idle timeout", async () => {
    await expect(
      loadEnv({ DB_IDLE_TIMEOUT_MS: "-1" })
    ).rejects.toThrow("DB_IDLE_TIMEOUT_MS");
  });

  it("should reject an excessive connection timeout", async () => {
    await expect(
      loadEnv({ DB_CONNECTION_TIMEOUT_MS: "70000" })
    ).rejects.toThrow("DB_CONNECTION_TIMEOUT_MS");
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
