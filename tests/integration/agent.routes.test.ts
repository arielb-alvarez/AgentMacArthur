import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("POST /api/agent/chat", () => {
  it("should return a successful response for a valid message", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "Hello AgentMacArthur",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.agent).toBe("AgentMacArthur");
    expect(response.body.response).toContain("Hello AgentMacArthur");
  });

  it("should reject an empty message", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });

  it("should reject a number instead of a string", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: 12345,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });
});