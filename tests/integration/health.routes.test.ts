import { beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/config/database.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/database.js")>();

  return {
    ...actual,
    checkDatabaseHealth: vi.fn(),
  };
});

import { checkDatabaseHealth } from "../../src/config/database.js";
import app from "../../src/app.js";

const mockedCheckDatabaseHealth = vi.mocked(checkDatabaseHealth);

describe("Health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("should return a successful health response", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.application).toBe("AgentMacArthur");
      expect(response.body.status).toBe("healthy");
    });
  });

  describe("GET /health/live", () => {
    it("should confirm that the application is alive", async () => {
      const response = await request(app).get("/health/live");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.application).toBe("AgentMacArthur");
      expect(response.body.status).toBe("alive");

      expect(mockedCheckDatabaseHealth).not.toHaveBeenCalled();
    });
  });

  describe("GET /health/ready", () => {
    it("should return ready when the database is healthy", async () => {
      mockedCheckDatabaseHealth.mockResolvedValue(true);

      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe("ready");
      expect(response.body.checks.database).toBe("healthy");
    });

    it("should return 503 when the database is unhealthy", async () => {
      mockedCheckDatabaseHealth.mockResolvedValue(false);

      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe("not_ready");
      expect(response.body.checks.database).toBe("unhealthy");
    });
  });

  describe("Request ID", () => {
    it("should generate a request ID when none is provided", async () => {
      const response = await request(app).get("/health");

      const requestId = response.headers["x-request-id"];

      expect(requestId).toBeDefined();
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("should accept a valid incoming request ID", async () => {
      const requestId = "client-request_123.abc";

      const response = await request(app)
        .get("/health")
        .set("X-Request-ID", requestId);

      expect(response.status).toBe(200);
      expect(response.headers["x-request-id"]).toBe(requestId);
    });

    it("should generate a new request ID when the incoming ID is invalid", async () => {
      const invalidRequestId = "invalid request id!";

      const response = await request(app)
        .get("/health")
        .set("X-Request-ID", invalidRequestId);

      const generatedRequestId = response.headers["x-request-id"];

      expect(response.status).toBe(200);
      expect(generatedRequestId).toBeDefined();
      expect(generatedRequestId).not.toBe(invalidRequestId);
      expect(generatedRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });
});
