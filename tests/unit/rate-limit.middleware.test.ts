import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { createRateLimiters } from "../../src/middleware/rate-limit.middleware.js";

describe("Rate limit middleware", () => {
  const createTestApp = () => {
    const app = express();

    const { apiRateLimiter, chatRateLimiter } = createRateLimiters({
      windowMs: 60_000,
      apiLimit: 4,
      chatLimit: 1,
    });

    app.use("/api", apiRateLimiter);

    app.get("/api/general", (_req, res) => {
      res.status(200).json({ success: true });
    });

    app.post(
      "/api/agent/chat",
      chatRateLimiter,
      (_req, res) => {
        res.status(200).json({ success: true });
      }
    );

    return app;
  };

  it("should return 429 after exceeding the general API limit", async () => {
    const app = createTestApp();

    await request(app).get("/api/general").expect(200);
    await request(app).get("/api/general").expect(200);
    await request(app).get("/api/general").expect(200);
    await request(app).get("/api/general").expect(200);

    const response = await request(app).get("/api/general");

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.headers["ratelimit"]).toBeDefined();
  });

  it("should return 429 after exceeding the chat limit", async () => {
    const app = createTestApp();

    await request(app).post("/api/agent/chat").expect(200);

    const response = await request(app).post("/api/agent/chat");

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("CHAT_RATE_LIMIT_EXCEEDED");
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.headers["ratelimit"]).toBeDefined();
  });

  it("should apply general and chat limits independently", async () => {
    const app = createTestApp();

    // First chat request consumes one general API request.
    await request(app).post("/api/agent/chat").expect(200);

    // Chat-specific limit is now exhausted.
    const blockedChat = await request(app).post("/api/agent/chat");

    expect(blockedChat.status).toBe(429);
    expect(blockedChat.body.error.code).toBe("CHAT_RATE_LIMIT_EXCEEDED");

    // Two more general requests use the remaining general allowance.
    await request(app).get("/api/general").expect(200);
    await request(app).get("/api/general").expect(200);

    // The general API limit is now exhausted.
    const blockedGeneral = await request(app).get("/api/general");

    expect(blockedGeneral.status).toBe(429);
    expect(blockedGeneral.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});