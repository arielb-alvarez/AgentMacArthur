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
  organizationController: {
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    listMembers: vi.fn(),
    getMember: vi.fn(),
  },
  authMiddleware: {
    requireAuth: vi.fn(),
  },
}));

vi.mock("../../src/container/organization.container.js", () => ({
  organizationController: mocks.organizationController,
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

describe("Organization HTTP Routes", () => {
  const app = createApp();
  const allowedOrigin = env.CORS_ORIGINS[0];

  const organizationId = "11111111-1111-4111-8111-111111111111";

  const validOrganization = {
    id: organizationId,
    name: "Development Team",
    slug: "development-team",
    type: "team",
    ownerUserId: "user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default authentication behavior: allow the request.
    mocks.authMiddleware.requireAuth.mockImplementation(
      (
        _req: Request,
        _res: Response,
        next: NextFunction
      ) => next()
    );

    // Default controller responses.
    mocks.organizationController.list.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          organizations: [validOrganization],
        })
    );

    mocks.organizationController.getById.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          organization: validOrganization,
        })
    );

    mocks.organizationController.update.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Organization updated successfully.",
          organization: {
            ...validOrganization,
            name: "Updated Development Team",
          },
        })
    );

    mocks.organizationController.listMembers.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          members: [],
        })
    );

    mocks.organizationController.getMember.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          member: {},
        })
    );
  });

  describe("GET /api/organizations", () => {
    it("should list accessible organizations", async () => {
      const response = await request(app)
        .get("/api/organizations")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organizations).toHaveLength(1);

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledOnce();

      expect(
        mocks.organizationController.list
      ).toHaveBeenCalledOnce();
    });
  });

  describe("GET /api/organizations/:organizationId", () => {
    it("should return organization details", async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization.id).toBe(
        organizationId
      );

      expect(
        mocks.organizationController.getById
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .get("/api/organizations/invalid-id")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.getById
      ).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/organizations/:organizationId", () => {
    it("should update organization details", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "Updated Development Team",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization.name).toBe(
        "Updated Development Team"
      );

      expect(
        mocks.organizationController.update
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .patch("/api/organizations/invalid-id")
        .set("Origin", allowedOrigin)
        .send({
          name: "Updated Team",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.update
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty update request", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.update
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty organization name", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "   ",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.update
      ).not.toHaveBeenCalled();
    });

    it("should reject organization names exceeding 150 characters", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "a".repeat(151),
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.update
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected update properties", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "Updated Team",
          ownerUserId: "attacker-user-id",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.update
      ).not.toHaveBeenCalled();
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated organization requests", async () => {
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
        .get("/api/organizations")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        success: false,
        message: "Authentication required.",
      });

      expect(
        mocks.organizationController.list
      ).not.toHaveBeenCalled();
    });

    it("should enforce authentication on every organization endpoint", async () => {
      const endpoints = [
        request(app)
          .get("/api/organizations"),

        request(app)
          .get(`/api/organizations/${organizationId}`),

        request(app)
          .patch(`/api/organizations/${organizationId}`)
          .send({
            name: "Updated Team",
          }),

        request(app)
          .get(`/api/organizations/${organizationId}/members`),

        request(app)
          .get(
            `/api/organizations/${organizationId}/members/22222222-2222-4222-8222-222222222222`
          ),
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

  describe("GET /api/organizations/:organizationId/members", () => {
    it("should list organization members", async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}/members`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.members).toEqual([]);

      expect(
        mocks.organizationController.listMembers
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .get("/api/organizations/invalid-id/members")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.listMembers
      ).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/organizations/:organizationId/members/:userId", () => {
    const userId = "22222222-2222-4222-8222-222222222222";

    it("should return organization member details", async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}/members/${userId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.organizationController.getMember
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .get(`/api/organizations/invalid-id/members/${userId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.getMember
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid user ID", async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}/members/invalid-id`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.getMember
      ).not.toHaveBeenCalled();
    });
  });
});
