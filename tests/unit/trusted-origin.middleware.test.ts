import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { requireTrustedOrigin } from "../../src/middleware/trusted-origin.middleware.js";
import { env } from "../../src/config/env.js";

describe("Trusted Origin Middleware", () => {
  const createRequest = (origin?: string): Request =>
    ({
      get: vi.fn().mockReturnValue(origin),
    }) as unknown as Request;

  it("should allow a configured frontend origin", () => {
    const req = createRequest(env.CORS_ORIGINS[0]);
    const next = vi.fn() as NextFunction;

    requireTrustedOrigin(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it("should reject a missing origin", () => {
    const req = createRequest(undefined);
    const next = vi.fn() as NextFunction;

    requireTrustedOrigin(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Request origin is not allowed.",
        statusCode: 403,
      })
    );
  });

  it("should reject an unconfigured origin", () => {
    const req = createRequest("https://malicious.example.com");
    const next = vi.fn() as NextFunction;

    requireTrustedOrigin(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Request origin is not allowed.",
        statusCode: 403,
      })
    );
  });
});
