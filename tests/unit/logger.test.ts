import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("Logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should redact sensitive fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("User authentication", {
      username: "test-user",
      password: "secret-password",
      accessToken: "secret-token",
      api_key: "secret-api-key",
      authorization: "Bearer secret",
    });

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain("test-user");
    expect(output).not.toContain("secret-password");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("secret-api-key");
    expect(output).toContain("[REDACTED]");
  });

  it("should redact sensitive fields inside nested objects", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("Nested data", {
      user: {
        name: "Test User",
        credentials: {
          password: "nested-secret",
        },
      },
    });

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain("Test User");
    expect(output).not.toContain("nested-secret");
    expect(output).toContain("[REDACTED]");
  });

  it("should handle circular references without throwing", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const context: Record<string, unknown> = {
      name: "circular-test",
    };

    context.self = context;

    expect(() => {
      logger.info("Circular context", context);
    }).not.toThrow();

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain("[Circular]");
  });

  it("should serialize repeated object references normally", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const sharedObject = {
      name: "shared-value",
    };

    logger.info("Repeated references", {
      first: sharedObject,
      second: sharedObject,
    });

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain('"first":{"name":"shared-value"}');
    expect(output).toContain('"second":{"name":"shared-value"}');
    expect(output).not.toContain("[Circular]");
  });

  it("should serialize BigInt values safely", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => {
      logger.info("BigInt context", {
        largeNumber: BigInt("9007199254740991"),
      });
    }).not.toThrow();

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain('"largeNumber":"9007199254740991"');
  });

  it("should serialize Date values as ISO strings", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("Date context", {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const output = consoleSpy.mock.calls[0]?.[0] as string;

    expect(output).toContain("2026-01-01T00:00:00.000Z");
  });

  it("should log errors using the error output stream", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("Something failed", {
      errorName: "DatabaseError",
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("[ERROR]");
  });

  it("should log warnings using the warning output stream", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("Something needs attention");

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0]?.[0]).toContain("[WARN]");
  });

  it("should output structured JSON in production mode", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    vi.stubEnv("NODE_ENV", "production");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      logger.info("Production test", {
        requestId: "production-test-123",
        password: "hidden-password",
      });

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Production test");
      expect(parsed.context.requestId).toBe("production-test-123");
      expect(parsed.context.password).toBe("[REDACTED]");
      expect(output).not.toContain("hidden-password");
    } finally {
      vi.stubEnv("NODE_ENV", originalNodeEnv);
    }
  });
});
