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
    transferOwnership: vi.fn(),
    updateMemberStatus: vi.fn(),
    updateMemberRole: vi.fn(),
    listRoles: vi.fn(),
    listPermissions: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    replaceRolePermissions: vi.fn(),
    assignMemberRole: vi.fn(),
    removeMemberRole: vi.fn(),
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

    mocks.organizationController.transferOwnership.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Organization ownership transferred successfully.",
          organization: {
            ...validOrganization,
            ownerUserId: "22222222-2222-4222-8222-222222222222",
          },
        })
    );

    mocks.organizationController.updateMemberStatus.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Organization member status updated.",
          member: {},
        })
    );

    mocks.organizationController.updateMemberRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Organization member role updated.",
          member: {},
        })
    );

    mocks.organizationController.listRoles.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          roles: [],
        })
    );

    mocks.organizationController.listPermissions.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          permissions: [],
        })
    );

    mocks.organizationController.createRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(201).json({
          success: true,
          message: "Custom role created successfully.",
          role: {},
        })
    );

    mocks.organizationController.updateRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Custom role updated successfully.",
          role: {},
        })
    );

    mocks.organizationController.deleteRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Custom role deleted successfully.",
        })
    );

    mocks.organizationController.replaceRolePermissions.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Custom role permissions updated successfully.",
          result: {},
        })
    );

    mocks.organizationController.assignMemberRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Custom role assigned successfully.",
        })
    );

    mocks.organizationController.removeMemberRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Custom role removed successfully.",
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

  describe("PATCH /api/organizations/:organizationId/members/:userId/status", () => {
    const memberUserId = "22222222-2222-4222-8222-222222222222";
    const endpoint = `/api/organizations/${organizationId}/members/${memberUserId}/status`;

    it("should update member status", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ status: "suspended" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.organizationController.updateMemberStatus
      ).toHaveBeenCalledOnce();
    });

    it("should accept active status", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ status: "active" });

      expect(response.status).toBe(200);

      expect(
        mocks.organizationController.updateMemberStatus
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid status", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ status: "deleted" });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberStatus
      ).not.toHaveBeenCalled();
    });

    it("should reject a missing status", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberStatus
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected request properties", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({
          status: "suspended",
          role: "admin",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberStatus
      ).not.toHaveBeenCalled();
    });

    it("should reject invalid path parameters", async () => {
      const response = await request(app)
        .patch(`/api/organizations/invalid-id/members/${memberUserId}/status`)
        .set("Origin", allowedOrigin)
        .send({ status: "suspended" });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberStatus
      ).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/organizations/:organizationId/members/:userId/role", () => {
    const memberUserId = "22222222-2222-4222-8222-222222222222";
    const endpoint = `/api/organizations/${organizationId}/members/${memberUserId}/role`;

    it("should update a member base role", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ role: "admin" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.organizationController.updateMemberRole
      ).toHaveBeenCalledOnce();
    });

    it("should accept member as a base role", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ role: "member" });

      expect(response.status).toBe(200);

      expect(
        mocks.organizationController.updateMemberRole
      ).toHaveBeenCalledOnce();
    });

    it("should reject owner as an ordinary base role change", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ role: "owner" });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberRole
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid role", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({ role: "superadmin" });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberRole
      ).not.toHaveBeenCalled();
    });

    it("should reject a missing role", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberRole
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected request properties", async () => {
      const response = await request(app)
        .patch(endpoint)
        .set("Origin", allowedOrigin)
        .send({
          role: "admin",
          assignedBy: "33333333-3333-4333-8333-333333333333",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberRole
      ).not.toHaveBeenCalled();
    });

    it("should reject invalid path parameters", async () => {
      const response = await request(app)
        .patch(`/api/organizations/${organizationId}/members/invalid-id/role`)
        .set("Origin", allowedOrigin)
        .send({ role: "admin" });

      expect(response.status).toBe(400);

      expect(
        mocks.organizationController.updateMemberRole
      ).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/organizations/:organizationId/transfer-ownership", () => {
    const targetUserId = "22222222-2222-4222-8222-222222222222";

    it("should transfer organization ownership", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/transfer-ownership`)
        .set("Origin", allowedOrigin)
        .send({ userId: targetUserId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization.ownerUserId).toBe(targetUserId);

      expect(
        mocks.organizationController.transferOwnership
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .post("/api/organizations/invalid-id/transfer-ownership")
        .set("Origin", allowedOrigin)
        .send({ userId: targetUserId });

      expect(response.status).toBe(400);
      expect(
        mocks.organizationController.transferOwnership
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid target user ID", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/transfer-ownership`)
        .set("Origin", allowedOrigin)
        .send({ userId: "invalid-id" });

      expect(response.status).toBe(400);
      expect(
        mocks.organizationController.transferOwnership
      ).not.toHaveBeenCalled();
    });

    it("should reject a missing target user ID", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/transfer-ownership`)
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);
      expect(
        mocks.organizationController.transferOwnership
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected request properties", async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/transfer-ownership`)
        .set("Origin", allowedOrigin)
        .send({
          userId: targetUserId,
          requesterUserId: "33333333-3333-4333-8333-333333333333",
        });

      expect(response.status).toBe(400);
      expect(
        mocks.organizationController.transferOwnership
      ).not.toHaveBeenCalled();
    });
  });

  describe("Custom Role Routes", () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    const roleId = "33333333-3333-4333-8333-333333333333";

    describe("GET /api/organizations/:organizationId/roles", () => {
      it("should list custom roles", async () => {
        const response = await request(app)
          .get(`/api/organizations/${organizationId}/roles?scope=project`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.listRoles).toHaveBeenCalledOnce();
      });

      it("should reject an invalid role scope", async () => {
        const response = await request(app)
          .get(`/api/organizations/${organizationId}/roles?scope=invalid`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(400);
        expect(mocks.organizationController.listRoles).not.toHaveBeenCalled();
      });
    });

    describe("GET /api/organizations/:organizationId/permissions", () => {
      it("should list permissions for a valid scope", async () => {
        const response = await request(app)
          .get(`/api/organizations/${organizationId}/permissions?scope=project`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.listPermissions).toHaveBeenCalledOnce();
      });

      it("should reject a missing scope", async () => {
        const response = await request(app)
          .get(`/api/organizations/${organizationId}/permissions`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(400);
        expect(mocks.organizationController.listPermissions).not.toHaveBeenCalled();
      });
    });

    describe("POST /api/organizations/:organizationId/roles", () => {
      it("should create a custom role", async () => {
        const response = await request(app)
          .post(`/api/organizations/${organizationId}/roles`)
          .send({
            scope: "project",
            key: "project_reviewer",
            name: "Project Reviewer",
            description: "Can review project work.",
          })
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.createRole).toHaveBeenCalledOnce();
      });

      it("should reject an invalid custom role key", async () => {
        const response = await request(app)
          .post(`/api/organizations/${organizationId}/roles`)
          .send({
            scope: "project",
            key: "Invalid Role Key",
            name: "Project Reviewer",
          })
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(400);
        expect(mocks.organizationController.createRole).not.toHaveBeenCalled();
      });
    });

    describe("PATCH /api/organizations/:organizationId/roles/:roleId", () => {
      it("should update a custom role", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${organizationId}/roles/${roleId}`)
          .send({
            name: "Senior Project Reviewer",
          })
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.updateRole).toHaveBeenCalledOnce();
      });

      it("should reject an update with no fields", async () => {
        const response = await request(app)
          .patch(`/api/organizations/${organizationId}/roles/${roleId}`)
          .send({})
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(400);
        expect(mocks.organizationController.updateRole).not.toHaveBeenCalled();
      });
    });

    describe("DELETE /api/organizations/:organizationId/roles/:roleId", () => {
      it("should delete a custom role", async () => {
        const response = await request(app)
          .delete(`/api/organizations/${organizationId}/roles/${roleId}`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.deleteRole).toHaveBeenCalledOnce();
      });
    });

    describe("PUT /api/organizations/:organizationId/roles/:roleId/permissions", () => {
      it("should replace custom role permissions", async () => {
        const response = await request(app)
          .put(`/api/organizations/${organizationId}/roles/${roleId}/permissions`)
          .send({
            permissionIds: [],
          })
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.replaceRolePermissions).toHaveBeenCalledOnce();
      });

      it("should reject invalid permission IDs", async () => {
        const response = await request(app)
          .put(`/api/organizations/${organizationId}/roles/${roleId}/permissions`)
          .send({
            permissionIds: ["invalid-id"],
          })
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(400);
        expect(mocks.organizationController.replaceRolePermissions).not.toHaveBeenCalled();
      });
    });

    describe("Organization custom role assignments", () => {
      it("should assign a custom role to a member", async () => {
        const response = await request(app)
          .post(`/api/organizations/${organizationId}/members/${userId}/roles/${roleId}`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.assignMemberRole).toHaveBeenCalledOnce();
      });

      it("should remove a custom role from a member", async () => {
        const response = await request(app)
          .delete(`/api/organizations/${organizationId}/members/${userId}/roles/${roleId}`)
          .set("Origin", allowedOrigin);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mocks.organizationController.removeMemberRole).toHaveBeenCalledOnce();
      });
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
      const userId = "22222222-2222-4222-8222-222222222222";
      const roleId = "33333333-3333-4333-8333-333333333333";

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
          .get(`/api/organizations/${organizationId}/members/${userId}`),

        request(app)
          .post(`/api/organizations/${organizationId}/transfer-ownership`)
          .send({
            userId,
          }),

        request(app)
          .patch(`/api/organizations/${organizationId}/members/${userId}/status`)
          .send({ status: "suspended" }),

        request(app)
          .patch(`/api/organizations/${organizationId}/members/${userId}/role`)
          .send({ role: "admin" }),

        // Custom role management endpoints
        request(app)
          .get(`/api/organizations/${organizationId}/roles?scope=organization`),

        request(app)
          .post(`/api/organizations/${organizationId}/roles`)
          .send({
            scope: "organization",
            key: "custom_role",
            name: "Custom Role",
          }),

        request(app)
          .patch(`/api/organizations/${organizationId}/roles/${roleId}`)
          .send({
            name: "Updated Custom Role",
          }),

        request(app)
          .delete(`/api/organizations/${organizationId}/roles/${roleId}`),

        request(app)
          .get(`/api/organizations/${organizationId}/permissions?scope=organization`),

        request(app)
          .put(`/api/organizations/${organizationId}/roles/${roleId}/permissions`)
          .send({
            permissionIds: [],
          }),

        // Organization-scoped custom role assignments
        request(app)
          .post(`/api/organizations/${organizationId}/members/${userId}/roles/${roleId}`),

        request(app)
          .delete(`/api/organizations/${organizationId}/members/${userId}/roles/${roleId}`),
      ];

      for (const endpoint of endpoints) {
        const response = await endpoint
          .set("Origin", allowedOrigin);

        expect(response.status).not.toBe(404);
      }

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledTimes(16);
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
