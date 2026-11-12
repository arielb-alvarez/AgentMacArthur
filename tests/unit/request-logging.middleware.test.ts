import express from "express";
import request from "supertest";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { requestIdMiddleware } from "../../src/middleware/request-id.middleware.js";
import { requestLoggerMiddleware } from "../../src/middleware/request-logger.middleware.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";
import { logger } from "../../src/utils/logger.js";

describe("Request logging middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createTestApp = () => {
    const app = express();

    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware);

    app.get("/success", (_req, res) => {
      res.status(200).json({ success: true });
    });

    app.get("/client-error", (_req, res) => {
      res.status(400).json({ success: false });
    });

    app.get("/server-error", (_req, _res, next) => {
      next(new Error("Test server error"));
    });

    app.use(errorMiddleware);

    return app;
  };

  it("should log successful requests with INFO level", async () => {
    const infoSpy = vi.spyOn(logger, "info");

    const app = createTestApp();

    const response = await request(app).get("/success");

    expect(response.status).toBe(200);

    expect(infoSpy).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        requestId: response.headers["x-request-id"],
        method: "GET",
        path: "/success",
        statusCode: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it("should log client errors with WARN level", async () => {
    const warnSpy = vi.spyOn(logger, "warn");

    const app = createTestApp();

    const response = await request(app).get("/client-error");

    expect(response.status).toBe(400);

    expect(warnSpy).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        requestId: response.headers["x-request-id"],
        method: "GET",
        path: "/client-error",
        statusCode: 400,
      })
    );
  });

  it("should log server errors with ERROR level", async () => {
    const errorSpy = vi.spyOn(logger, "error");

    const app = createTestApp();

    const response = await request(app).get("/server-error");

    expect(response.status).toBe(500);

    expect(errorSpy).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        requestId: response.headers["x-request-id"],
        method: "GET",
        path: "/server-error",
        statusCode: 500,
      })
    );
  });

  it("should exclude query parameters from logged paths", async () => {
    const infoSpy = vi.spyOn(logger, "info");

    const app = createTestApp();

    await request(app).get("/success?token=secret123");

    expect(infoSpy).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        path: "/success",
      })
    );

    const loggedContext = infoSpy.mock.calls[0]?.[1];

    expect(loggedContext).not.toHaveProperty("token");
    expect(loggedContext).not.toHaveProperty("query");
  });

  it("should include the same request ID in error and completion logs", async () => {
    const errorSpy = vi.spyOn(logger, "error");

    const app = createTestApp();

    const response = await request(app)
      .get("/server-error")
      .set("X-Request-ID", "trace-test-123");

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toBe("trace-test-123");

    expect(errorSpy).toHaveBeenCalledWith(
      "Request failed",
      expect.objectContaining({
        requestId: "trace-test-123",
        method: "GET",
        path: "/server-error",
      })
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({
        requestId: "trace-test-123",
        statusCode: 500,
      })
    );
  });
});
