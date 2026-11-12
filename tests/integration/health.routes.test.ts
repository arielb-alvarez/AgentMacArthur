import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("GET /health", () => {
  it("should return a successful health response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.application).toBe("AgentMacArthur");
    expect(response.body.status).toBe("healthy");
  });

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
