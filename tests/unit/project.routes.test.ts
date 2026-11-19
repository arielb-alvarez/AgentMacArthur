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
  projectController: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
  projectMemberController: {
    list: vi.fn(),
    add: vi.fn(),
    updateRole: vi.fn(),
    updateStatus: vi.fn(),
    remove: vi.fn(),
    assignCustomRole: vi.fn(),
    removeCustomRole: vi.fn(),
    transferOwnership: vi.fn(),
  },
  authMiddleware: {
    requireAuth: vi.fn(),
  },
}));

vi.mock("../../src/container/project.container.js", () => ({
  projectController: mocks.projectController,
}));

vi.mock("../../src/container/project.container.js", () => ({
  projectController: mocks.projectController,
  projectMemberController: mocks.projectMemberController,
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

describe("Project HTTP Routes", () => {
  const app = createApp();
  const allowedOrigin = env.CORS_ORIGINS[0];

  const organizationId = "11111111-1111-4111-8111-111111111111";
  const projectId = "22222222-2222-4222-8222-222222222222";

  const validProject = {
    id: projectId,
    organizationId,
    name: "Website Redesign",
    description: "A new company website.",
    status: "draft",
    createdBy: "user-123",
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
    mocks.projectController.create.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(201).json({
          success: true,
          message: "Project created successfully.",
          project: validProject,
        })
    );

    mocks.projectController.list.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          projects: [validProject],
        })
    );

    mocks.projectController.getById.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          project: validProject,
        })
    );

    mocks.projectController.update.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project updated successfully.",
          project: validProject,
        })
    );

    mocks.projectController.updateStatus.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project status updated successfully.",
          project: {
            ...validProject,
            status: "active",
          },
        })
    );

    mocks.projectMemberController.list.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          members: [],
        })
    );

    mocks.projectMemberController.add.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(201).json({
          success: true,
          message: "Project member added successfully.",
          member: { userId: "33333333-3333-4333-8333-333333333333" },
        })
    );

    mocks.projectMemberController.updateRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project member role updated successfully.",
        })
    );

    mocks.projectMemberController.updateStatus.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project member status updated successfully.",
        })
    );

    mocks.projectMemberController.remove.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project member removed successfully.",
        })
    );

    mocks.projectMemberController.assignCustomRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project custom role assigned successfully.",
        })
    );

    mocks.projectMemberController.removeCustomRole.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project custom role removed successfully.",
        })
    );

    mocks.projectMemberController.transferOwnership.mockImplementation(
      (_req: Request, res: Response) =>
        res.status(200).json({
          success: true,
          message: "Project ownership transferred successfully.",
        })
    );
  });

  describe("POST /api/projects", () => {
    it("should create a project", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("Origin", allowedOrigin)
        .send({
          organizationId,
          name: "Website Redesign",
          description: "A new company website.",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.project.name).toBe(
        "Website Redesign"
      );

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledOnce();

      expect(
        mocks.projectController.create
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization ID", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("Origin", allowedOrigin)
        .send({
          organizationId: "invalid-id",
          name: "Website Redesign",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation failed");

      expect(
        mocks.projectController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject an empty project name", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("Origin", allowedOrigin)
        .send({
          organizationId,
          name: "   ",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject project names exceeding 150 characters", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("Origin", allowedOrigin)
        .send({
          organizationId,
          name: "a".repeat(151),
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.create
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected request properties", async () => {
      const response = await request(app)
        .post("/api/projects")
        .set("Origin", allowedOrigin)
        .send({
          organizationId,
          name: "Website Redesign",
          createdBy: "attacker-user-id",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.create
      ).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/projects", () => {
    it("should list accessible projects", async () => {
      const response = await request(app)
        .get("/api/projects")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.projects).toHaveLength(1);

      expect(
        mocks.projectController.list
      ).toHaveBeenCalledOnce();
    });

    it("should accept a valid organization filter", async () => {
      const response = await request(app)
        .get(`/api/projects?organizationId=${organizationId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);

      expect(
        mocks.projectController.list
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid organization filter", async () => {
      const response = await request(app)
        .get("/api/projects?organizationId=invalid-id")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.list
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected query parameters", async () => {
      const response = await request(app)
        .get("/api/projects?userId=attacker")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.list
      ).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/projects/:projectId", () => {
    it("should return project details", async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.project.id).toBe(projectId);

      expect(
        mocks.projectController.getById
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid project ID", async () => {
      const response = await request(app)
        .get("/api/projects/invalid-id")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.getById
      ).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/projects/:projectId", () => {
    it("should update project details", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "Updated Website",
          description: "Updated description.",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.projectController.update
      ).toHaveBeenCalledOnce();
    });

    it("should reject an empty update request", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Origin", allowedOrigin)
        .send({});

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.update
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected update properties", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set("Origin", allowedOrigin)
        .send({
          name: "Updated Website",
          organizationId,
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.update
      ).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/projects/:projectId/status", () => {
    it("should update project status", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set("Origin", allowedOrigin)
        .send({
          status: "active",
        });

      expect(response.status).toBe(200);
      expect(response.body.project.status).toBe("active");

      expect(
        mocks.projectController.updateStatus
      ).toHaveBeenCalledOnce();
    });

    it("should reject an unsupported project status", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/status`)
        .set("Origin", allowedOrigin)
        .send({
          status: "published",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectController.updateStatus
      ).not.toHaveBeenCalled();
    });
  });

  describe("Project Member Routes", () => {
    const userId = "33333333-3333-4333-8333-333333333333";

    it("should list project members", async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/members`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.members).toEqual([]);

      expect(
        mocks.projectMemberController.list
      ).toHaveBeenCalledOnce();
    });

    it("should add a project member", async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Origin", allowedOrigin)
        .send({
          userId,
          role: "developer",
        });

      expect(response.status).toBe(201);

      expect(
        mocks.projectMemberController.add
      ).toHaveBeenCalledOnce();
    });

    it("should reject project_owner when adding a member", async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Origin", allowedOrigin)
        .send({
          userId,
          role: "project_owner",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.add
      ).not.toHaveBeenCalled();
    });

    it("should reject unexpected add-member properties", async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Origin", allowedOrigin)
        .send({
          userId,
          role: "developer",
          status: "active",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.add
      ).not.toHaveBeenCalled();
    });

    it("should update a member role", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/members/${userId}/role`)
        .set("Origin", allowedOrigin)
        .send({ role: "technical_lead" });

      expect(response.status).toBe(200);

      expect(
        mocks.projectMemberController.updateRole
      ).toHaveBeenCalledOnce();
    });

    it("should reject project_owner in ordinary role updates", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/members/${userId}/role`)
        .set("Origin", allowedOrigin)
        .send({ role: "project_owner" });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.updateRole
      ).not.toHaveBeenCalled();
    });

    it("should update a member status", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/members/${userId}/status`)
        .set("Origin", allowedOrigin)
        .send({ status: "suspended" });

      expect(response.status).toBe(200);

      expect(
        mocks.projectMemberController.updateStatus
      ).toHaveBeenCalledOnce();
    });

    it("should reject an unsupported member status", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/members/${userId}/status`)
        .set("Origin", allowedOrigin)
        .send({ status: "deleted" });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.updateStatus
      ).not.toHaveBeenCalled();
    });

    it("should remove a project member", async () => {
      const response = await request(app)
        .delete(`/api/projects/${projectId}/members/${userId}`)
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);

      expect(
        mocks.projectMemberController.remove
      ).toHaveBeenCalledOnce();
    });

    it("should assign a project custom role", async () => {
      const roleId = "44444444-4444-4444-8444-444444444444";

      const response = await request(app)
        .post(
          `/api/projects/${projectId}/members/${userId}/roles/${roleId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.projectMemberController.assignCustomRole
      ).toHaveBeenCalledOnce();
    });

    it("should remove a project custom role", async () => {
      const roleId = "44444444-4444-4444-8444-444444444444";

      const response = await request(app)
        .delete(
          `/api/projects/${projectId}/members/${userId}/roles/${roleId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(
        mocks.projectMemberController.removeCustomRole
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid custom role ID", async () => {
      const response = await request(app)
        .post(
          `/api/projects/${projectId}/members/${userId}/roles/invalid-id`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.assignCustomRole
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid project ID for custom role assignment", async () => {
      const roleId = "44444444-4444-4444-8444-444444444444";

      const response = await request(app)
        .post(
          `/api/projects/invalid-id/members/${userId}/roles/${roleId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.assignCustomRole
      ).not.toHaveBeenCalled();
    });

    it("should reject an invalid user ID for custom role assignment", async () => {
      const roleId = "44444444-4444-4444-8444-444444444444";

      const response = await request(app)
        .post(
          `/api/projects/${projectId}/members/invalid-id/roles/${roleId}`
        )
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.assignCustomRole
      ).not.toHaveBeenCalled();
    });

    it("should transfer project ownership", async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/ownership/transfer`)
        .set("Origin", allowedOrigin)
        .send({ newOwnerUserId: userId });

      expect(response.status).toBe(200);

      expect(
        mocks.projectMemberController.transferOwnership
      ).toHaveBeenCalledOnce();
    });

    it("should reject an invalid target user ID", async () => {
      const response = await request(app)
        .patch(`/api/projects/${projectId}/members/invalid-id/role`)
        .set("Origin", allowedOrigin)
        .send({ role: "developer" });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.updateRole
      ).not.toHaveBeenCalled();
    });

    it("should reject an unexpected ownership transfer property", async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/ownership/transfer`)
        .set("Origin", allowedOrigin)
        .send({
          newOwnerUserId: userId,
          role: "project_owner",
        });

      expect(response.status).toBe(400);

      expect(
        mocks.projectMemberController.transferOwnership
      ).not.toHaveBeenCalled();
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated project requests", async () => {
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
        .get("/api/projects")
        .set("Origin", allowedOrigin);

      expect(response.status).toBe(401);

      expect(response.body).toEqual({
        success: false,
        message: "Authentication required.",
      });

      expect(
        mocks.projectController.list
      ).not.toHaveBeenCalled();
    });

    it("should enforce authentication on every project endpoint", async () => {
      const endpoints = [
        request(app)
          .post("/api/projects")
          .send({
            organizationId,
            name: "Test Project",
          }),

        request(app)
          .get("/api/projects"),

        request(app)
          .get(`/api/projects/${projectId}`),

        request(app)
          .patch(`/api/projects/${projectId}`)
          .send({
            name: "Updated Project",
          }),

        request(app)
          .patch(`/api/projects/${projectId}/status`)
          .send({
            status: "active",
          }),

        request(app)
          .post(
            `/api/projects/${projectId}/members/33333333-3333-4333-8333-333333333333/roles/44444444-4444-4444-8444-444444444444`
          ),

        request(app)
          .delete(
            `/api/projects/${projectId}/members/33333333-3333-4333-8333-333333333333/roles/44444444-4444-4444-8444-444444444444`
          ),
      ];

      for (const endpoint of endpoints) {
        const response = await endpoint
          .set("Origin", allowedOrigin);

        expect(response.status).not.toBe(404);
      }

      expect(
        mocks.authMiddleware.requireAuth
      ).toHaveBeenCalledTimes(7);
    });
  });
});
