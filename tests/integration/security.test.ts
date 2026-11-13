import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("Application security", () => {
  describe("Helmet security headers", () => {
    it("should include standard security headers", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
      expect(response.headers["content-security-policy"]).toBeDefined();
    });
  });

  describe("CORS configuration", () => {
    it("should allow configured Angular frontend origin", async () => {
      const response = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:4200");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:4200"
      );
    });

    it("should allow configured Vite frontend origin", async () => {
      const response = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:5173");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173"
      );
    });

    it("should not grant CORS permission to an unapproved origin", async () => {
      const response = await request(app)
        .get("/health")
        .set("Origin", "https://malicious.example");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("should allow requests without an Origin header", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Request body protection", () => {
    it("should reject JSON payloads larger than 1 MB", async () => {
      const largePayload = {
        message: "a".repeat(1024 * 1024),
      };

      const response = await request(app)
        .post("/api/agent/chat")
        .set("Content-Type", "application/json")
        .send(JSON.stringify(largePayload));

      expect(response.status).toBe(413);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("should reject malformed JSON", async () => {
      const response = await request(app)
        .post("/api/agent/chat")
        .set("Content-Type", "application/json")
        .send('{"message":');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_JSON");
    });
  });
});