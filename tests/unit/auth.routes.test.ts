import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  authController: {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
  authMiddleware: {
    requireAuth: vi.fn(),
    optionalAuth: vi.fn(),
  },
}));

vi.mock("../../src/container/auth.container.js", () => ({
  authController: mocks.authController,
  authMiddleware: mocks.authMiddleware,
}));

import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";

describe("Authentication HTTP Routes", () => {
  const app = createApp();
  const allowedOrigin = env.CORS_ORIGINS[0];

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authController.login.mockImplementation(
      (_req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          message: "Login successful.",
        });
      }
    );

    mocks.authController.me.mockImplementation(
      (_req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          user: {
            id: "user-123",
            email: "test@example.com",
          },
        });
      }
    );

    mocks.authController.logout.mockImplementation(
      (_req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          message: "Logout successful.",
        });
      }
    );

    mocks.authMiddleware.requireAuth.mockImplementation(
      (_req: Request, _res: Response, next: NextFunction) =>
        next()
    );

    mocks.authMiddleware.optionalAuth.mockImplementation(
      (_req: Request, _res: Response, next: NextFunction) =>
        next()
    );
  });

  it("should allow login from a configured frontend origin", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        email: "test@example.com",
        password: "password123",
      });

    expect(response.status).toBe(200);

    expect(response.headers["access-control-allow-origin"])
      .toBe(allowedOrigin);

    expect(response.headers["access-control-allow-credentials"])
      .toBe("true");

    expect(mocks.authController.login).toHaveBeenCalledOnce();
  });

  it("should reject login from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://malicious.example.com")
      .send({
        email: "test@example.com",
        password: "password123",
      });

    expect(response.status).toBe(403);
    expect(mocks.authController.login).not.toHaveBeenCalled();
  });

  it("should reject login without an origin", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test@example.com",
        password: "password123",
      });

    expect(response.status).toBe(403);
    expect(mocks.authController.login).not.toHaveBeenCalled();
  });

  it("should validate login input before calling the controller", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        email: "invalid-email",
        password: "",
      });

    expect(response.status).toBe(400);
    expect(mocks.authController.login).not.toHaveBeenCalled();
  });

  it("should route authenticated user requests to the controller", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Origin", allowedOrigin);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    });

    expect(mocks.authMiddleware.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.authController.me).toHaveBeenCalledOnce();
  });

  it("should allow logout from a configured frontend origin", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", allowedOrigin);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(mocks.authMiddleware.optionalAuth).toHaveBeenCalledOnce();
    expect(mocks.authController.logout).toHaveBeenCalledOnce();
  });

  it("should reject logout from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://malicious.example.com");

    expect(response.status).toBe(403);
    expect(mocks.authController.logout).not.toHaveBeenCalled();
  });

  it("should handle credentialed CORS preflight requests", async () => {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);

    expect(response.headers["access-control-allow-origin"])
      .toBe(allowedOrigin);

    expect(response.headers["access-control-allow-credentials"])
      .toBe("true");
  });
});
