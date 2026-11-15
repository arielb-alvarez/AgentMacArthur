import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import {
  createAuthenticationMiddleware,
} from "../../src/middleware/auth.middleware.js";

import { AppError } from "../../src/errors/app.error.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session-cookie.js";
import type { AuthService } from "../../src/auth/auth.service.js";

describe("Authentication Middleware", () => {
  const authenticatedSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
      displayName: "Test User",
      status: "active" as const,
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "session-123",
      userId: "user-123",
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
    },
  };

  let authService: {
    authenticate: ReturnType<typeof vi.fn>;
  };

  let middleware: ReturnType<
    typeof createAuthenticationMiddleware
  >;

  let req: Request;
  let next: ReturnType<typeof vi.fn>;

  const createRequest = (cookie?: string): Request =>
    ({
      headers: cookie ? { cookie } : {},
    }) as Request;

  beforeEach(() => {
    authService = {
      authenticate: vi.fn(),
    };

    middleware = createAuthenticationMiddleware(
      authService as unknown as AuthService
    );

    req = createRequest();
    next = vi.fn();
  });

  describe("requireAuth", () => {
    it("should reject requests without a session cookie", async () => {
      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Authentication required.",
          statusCode: 401,
        })
      );

      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it("should authenticate a valid session cookie", async () => {
      authService.authenticate.mockResolvedValue(
        authenticatedSession
      );

      req = createRequest(
        `${SESSION_COOKIE_NAME}=valid-token`
      );

      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(authService.authenticate).toHaveBeenCalledWith(
        "valid-token"
      );

      expect(req.auth).toEqual(authenticatedSession);
      expect(next).toHaveBeenCalledWith();
    });

    it("should reject an invalid session", async () => {
      authService.authenticate.mockRejectedValue(
        new AppError("Invalid or expired session.", 401)
      );

      req = createRequest(
        `${SESSION_COOKIE_NAME}=invalid-token`
      );

      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
        })
      );
    });

    it("should reject duplicate session cookies", async () => {
      req = createRequest(
        `${SESSION_COOKIE_NAME}=first; ${SESSION_COOKIE_NAME}=second`
      );

      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
        })
      );

      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it("should reject malformed URL encoding", async () => {
      req = createRequest(
        `${SESSION_COOKIE_NAME}=%E0%A4%A`
      );

      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
        })
      );

      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it("should propagate unexpected authentication errors", async () => {
      const databaseError = new Error("Database unavailable");

      authService.authenticate.mockRejectedValue(databaseError);

      req = createRequest(
        `${SESSION_COOKIE_NAME}=valid-token`
      );

      await middleware.requireAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(databaseError);
    });
  });

  describe("optionalAuth", () => {
    it("should allow requests without a session cookie", () => {
      middleware.optionalAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith();
      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it("should attach a valid authenticated session", async () => {
      authService.authenticate.mockResolvedValue(
        authenticatedSession
      );

      req = createRequest(
        `${SESSION_COOKIE_NAME}=valid-token`
      );

      middleware.optionalAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith();
      });

      expect(req.auth).toEqual(authenticatedSession);
    });

    it("should treat an invalid session as anonymous", async () => {
      authService.authenticate.mockRejectedValue(
        new AppError("Invalid or expired session.", 401)
      );

      req = createRequest(
        `${SESSION_COOKIE_NAME}=invalid-token`
      );

      middleware.optionalAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith();
      });

      expect(req.auth).toBeUndefined();
    });

    it("should propagate unexpected authentication errors", async () => {
      const databaseError = new Error("Database unavailable");

      authService.authenticate.mockRejectedValue(databaseError);

      req = createRequest(
        `${SESSION_COOKIE_NAME}=valid-token`
      );

      middleware.optionalAuth(
        req,
        {} as Response,
        next as NextFunction
      );

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith(databaseError);
      });
    });
  });
});
