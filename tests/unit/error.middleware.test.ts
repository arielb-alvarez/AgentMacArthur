import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import { AppError } from "../../src/errors/app.error.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";

const createTestApp = (
  error: Error,
) => {
  const app = express();

  app.get("/test", (_req, _res, next) => {
    next(error);
  });

  app.use(errorMiddleware);

  return app;
};

describe("Error Middleware", () => {
  it("should return the intended status and message for operational errors", async () => {
    const app = createTestApp(
      new AppError("Conversation not found.", 404)
    );

    const response = await request(app).get("/test");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Conversation not found.",
    });
  });

  it("should hide non-operational application errors", async () => {
    const app = createTestApp(
      new AppError("Internal database failure.", 503, false)
    );

    const response = await request(app).get("/test");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "Internal database failure."
    );
  });

  it("should hide unexpected error details", async () => {
    const app = createTestApp(
      new Error("Sensitive internal implementation detail")
    );

    const response = await request(app).get("/test");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      "An unexpected error occurred."
    );
    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive internal implementation detail"
    );
  });

  it("should reject status codes below 400", () => {
    expect(
      () => new AppError("Invalid status", 200)
    ).toThrow(RangeError);
  });

  it("should reject status codes above 599", () => {
    expect(
      () => new AppError("Invalid status", 600)
    ).toThrow(RangeError);
  });

  it("should reject non-integer status codes", () => {
    expect(
      () => new AppError("Invalid status", 404.5)
    ).toThrow(RangeError);
  });
});

