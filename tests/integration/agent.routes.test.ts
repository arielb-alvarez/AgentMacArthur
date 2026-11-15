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


  it("should reject a whitespace-only message", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "   ",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "message",
        }),
      ])
    );
  });

  it("should reject messages exceeding 10,000 characters", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "a".repeat(10_001),
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should reject an invalid conversation ID", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "Hello",
        conversationId: "invalid-id",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "conversationId",
        }),
      ])
    );
  });

  it("should reject unexpected request properties", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .send({
        message: "Hello",
        unexpectedField: "not allowed",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should maintain conversation history across requests", async () => {
    const firstResponse = await request(app)
        .post("/api/agent/chat")
        .send({
        message: "My name is Alex.",
        });

    const conversationId = firstResponse.body.conversationId;

    const secondResponse = await request(app)
        .post("/api/agent/chat")
        .send({
        message: "What is my name?",
        conversationId,
        });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    expect(secondResponse.body.conversationId).toBe(conversationId);

    expect(secondResponse.body.response).toContain(
        "Total messages in conversation: 3."
    );
  });
});