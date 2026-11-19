import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  Request,
  Response,
  NextFunction,
} from "express";

import request from "supertest";
import { AppError } from "../../src/errors/app.error.js";

const mocks = vi.hoisted(() => ({
  invitationController: {
    create: vi.fn(),
    list: vi.fn(),
    resend: vi.fn(),
    revoke: vi.fn(),
    accept: vi.fn(),
  },
  authMiddleware: {
    requireAuth: vi.fn(),
  },
}));

vi.mock("../../src/container/invitation.container.js", () => ({
  invitationController: mocks.invitationController,
}));

vi.mock("../../src/container/auth.container.js", () => ({
  authController: {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
  authMiddleware: {
    requireAuth: mocks.authMiddleware.requireAuth,
    optionalAuth: vi.fn(),
  },
}));

import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";

describe("Invitation HTTP Routes", () => {
  const app = createApp();
  const allowedOrigin = env.CORS_ORIGINS[0];

  const organizationId = "11111111-1111-4111-8111-111111111111";
  const invitationId = "22222222-2222-4222-8222-222222222222";

  const validInvitation = {
    id: invitationId,
    organizationId,
    projectId: null,
    email: "developer@example.com",
    roleId: "33333333-3333-4333-8333-333333333333",
    roleKey: "member",
    roleName: "Member",
    invitedBy: "user-123",
    acceptedBy: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 86400000),
    acceptedAt: null,
    createdAt: new Date(),
    emailDeliveryStatus: "sent",
    emailDeliveryAttempts: 1,
    emailLastAttemptAt: new Date(),
    emailSentAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authMiddleware.requireAuth.mockImplementation(
      (
        _req: Request,
        _res: Response,
        next: NextFunction
      ) => next()
    );

    mocks.invitationController.create.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(201).json({
          success: true,
          message: "Invitation created successfully.",
          invitation: validInvitation,
        })
    );

    mocks.invitationController.list.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          invitations: [validInvitation],
        })
    );

    mocks.invitationController.resend.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Invitation resent successfully.",
          invitation: validInvitation,
        })
    );

    mocks.invitationController.revoke.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Invitation revoked successfully.",
          invitation: {
            ...validInvitation,
            status: "revoked",
          },
        })
    );

    mocks.invitationController.accept.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Invitation accepted successfully.",
        })
    );
  });

  describe("POST /api/organizations/:organizationId/invitations", () => {
    it("should create an organization invitation", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin)
        .send({
          email: "developer@example.com",
          roleKey: "member",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.invitation.email).toBe(
        "developer@example.com"
      );

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledOnce();

      expect(
        mocks.invitationController.create
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .post("/api/organizations/invalid-id/invitations")
        .set("Origin", allowedOrigin)
        .send({
          email: "developer@example.com",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid email address", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin)
        .send({
          email: "not-an-email",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject an unsupported organization role", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin)
        .send({
          email: "developer@example.com",
          roleKey: "owner",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected request properties", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin)
        .send({
          email: "developer@example.com",
          roleKey: "member",
          invitedBy: "attacker-user-id",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/organizations/:organizationId/invitations", () => {
    it("should list organization invitations", async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.invitations).toHaveLength(1);

      expect(
        mocks.invitationController.list
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .get("/api/organizations/invalid-id/invitations")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.list
      ).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/organizations/:organizationId/invitations/:invitationId/resend", () => {
    it("should resend an invitation", async () => {
      const response = await request(app)
        .post(
          `/api/organizations/${organizationId}/invitations/${invitationId}/resend`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.invitationController.resend
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid invitation ID", async () => {
      const response = await request(app)
        .post(
          `/api/organizations/${organizationId}/invitations/invalid-id/resend`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.resend
      ).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/organizations/:organizationId/invitations/:invitationId", () => {
    it("should revoke an invitation", async () => {
      const response = await request(app)
        .delete(
          `/api/organizations/${organizationId}/invitations/${invitationId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.invitation.status).toBe("revoked");

      expect(
        mocks.invitationController.revoke
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .delete(
          `/api/organizations/invalid-id/invitations/${invitationId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.revoke
      ).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/invitations/accept", () => {
    it("should accept an invitation", async () => {
      const response = await request(app)
        .post("/api/invitations/accept")
        .set("Origin", allowedOrigin)
        .send({
          token: "valid-invitation-token",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.invitationController.accept
      ).toHaveBeenCalledOnce();
    });

    it("should reject a missing invitation token", async () => {
      const response = await request(app)
        .post("/api/invitations/accept")
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.accept
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty invitation token", async () => {
      const response = await request(app)
        .post("/api/invitations/accept")
        .set("Origin", allowedOrigin)
        .send({
          token: "",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.invitationController.accept
      ).not.toHaveBeenCalled();
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated invitation requests", async () => {
      mocks.authMiddleware.requireAuth.mockImplementation(
        (
          _req: Request,
          _res: Response,
          next: NextFunction
        ) => next(
          new AppError("Authentication required.", 401)
        )
      );

      const response = await request(app)
        .get(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        success: false,
        message: "Authentication required.",
      });

      expect(
        mocks.invitationController.list
      ).not.toHaveBeenCalled();
    });

    it("should enforce authentication on every invitation endpoint", async () => {
      const endpoints = [
        request(app)
          .post(`/api/organizations/${organizationId}/invitations`)
          .send({
            email: "developer@example.com",
            roleKey: "member",
          }),

        request(app)
          .get(`/api/organizations/${organizationId}/invitations`),

        request(app)
          .post(
            `/api/organizations/${organizationId}/invitations/${invitationId}/resend`
          ),

        request(app)
          .delete(
            `/api/organizations/${organizationId}/invitations/${invitationId}`
          ),

        request(app)
          .post("/api/invitations/accept")
          .send({
            token: "valid-invitation-token",
          }),
      ];

      for (const endpoint of endpoints) {
        const response = await endpoint
          .set("Origin", allowedOrigin);

        expect(response.status).not.toBe(404);
      }

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledTimes(5);
    });
  });

  describe("Trusted Origin Protection", () => {
    it("should reject invitation creation without an Origin header", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .send({
          email: "developer@example.com",
          roleKey: "member",
        });

      expect(response.status).toBe(403);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject invitation creation from an untrusted origin", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set("Origin", "https://malicious.example")
        .send({
          email: "developer@example.com",
          roleKey: "member",
        });

      expect(response.status).toBe(403);

      expect(
        mocks.invitationController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject invitation acceptance without an Origin header", async () => {
      const response = await request(app)
        .post("/api/invitations/accept")
        .send({
          token: "valid-invitation-token",
        });

      expect(response.status).toBe(403);

      expect(
        mocks.invitationController.accept
      ).not.toHaveBeenCalled();
    });
  });
});
