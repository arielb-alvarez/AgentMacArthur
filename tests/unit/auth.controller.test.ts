import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createAuthController } from "../../src/controllers/auth.controller.js";
import type { RegistrationService } from "../../src/auth/registration.service.js";
import type { EmailVerificationService } from "../../src/auth/email-verification.service.js";
import type { AuthService } from "../../src/auth/auth.service.js";

const testUser = {
  id: "user-123",
  email: "test@example.com",
  displayName: "Test User",
  status: "active" as const,
  emailVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testSession = {
  id: "session-123",
  userId: "user-123",
  expiresAt: new Date(Date.now() + 60_000),
  lastUsedAt: new Date(),
  revokedAt: null,
  createdAt: new Date(),
};

describe("Authentication Controller", () => {
  let registrationService: {
    register: ReturnType<typeof vi.fn>;
  };

  let emailVerificationService: {
    verify: ReturnType<typeof vi.fn>;
  };

  let authService: {
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  let controller: ReturnType<typeof createAuthController>;

  let res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };

  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registrationService = {
      register: vi.fn(),
    };

    emailVerificationService = {
      verify: vi.fn(),
    };

    authService = {
      login: vi.fn(),
      logout: vi.fn(),
    };

    controller = createAuthController(
      registrationService as unknown as RegistrationService,
      emailVerificationService as unknown as EmailVerificationService,
      authService as unknown as AuthService
    );

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it("should register a user", async () => {
    registrationService.register.mockResolvedValue({
      user: testUser,
    });

    await controller.register(
      { body: { email: testUser.email } } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message:
        "Registration successful. Please check your email to verify your account.",
      user: testUser,
    });
  });

  it("should verify an email address", async () => {
    emailVerificationService.verify.mockResolvedValue(testUser);

    await controller.verifyEmail(
      { body: { token: "verification-token" } } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(emailVerificationService.verify).toHaveBeenCalledWith(
      "verification-token"
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Email address successfully verified.",
      user: testUser,
    });
  });

  it("should log in and set the session cookie", async () => {
    const expiresAt = new Date(Date.now() + 60_000);

    authService.login.mockResolvedValue({
      user: testUser,
      sessionId: testSession.id,
      sessionToken: "raw-session-token",
      expiresAt,
    });

    await controller.login(
      {
        body: {
          email: testUser.email,
          password: "password123",
        },
      } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(authService.login).toHaveBeenCalledWith({
      email: testUser.email,
      password: "password123",
    });

    expect(res.cookie).toHaveBeenCalledWith(
      "agentmacarthur_session",
      "raw-session-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);

    const responseBody = res.json.mock.calls[0][0];

    expect(responseBody).toEqual({
      success: true,
      message: "Login successful.",
      user: testUser,
    });

    expect(responseBody).not.toHaveProperty("sessionToken");
    expect(responseBody).not.toHaveProperty("sessionId");
  });

  it("should return the authenticated user", () => {
    controller.me(
      {
        auth: {
          user: testUser,
          session: testSession,
        },
      } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: testUser,
    });
  });

  it("should reject an unauthenticated me request", () => {
    controller.me(
      {} as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication required.",
        statusCode: 401,
      })
    );
  });

  it("should revoke the authenticated session and clear the cookie", async () => {
    authService.logout.mockResolvedValue(undefined);

    await controller.logout(
      {
        auth: {
          user: testUser,
          session: testSession,
        },
      } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(authService.logout).toHaveBeenCalledWith(
      testSession.id
    );

    expect(res.clearCookie).toHaveBeenCalledWith(
      "agentmacarthur_session",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Logout successful.",
    });
  });

  it("should clear the cookie when logging out anonymously", async () => {
    await controller.logout(
      {} as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledOnce();

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should propagate login errors", async () => {
    const error = new Error("Login failed");

    authService.login.mockRejectedValue(error);

    await controller.login(
      { body: {} } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(error);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("should propagate logout errors", async () => {
    const error = new Error("Session revocation failed");

    authService.logout.mockRejectedValue(error);

    await controller.logout(
      {
        auth: {
          user: testUser,
          session: testSession,
        },
      } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(error);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
