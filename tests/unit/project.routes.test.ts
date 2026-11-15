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
  authMiddleware: {
    requireAuth: vi.fn(),
  },
}));

vi.mock("../../src/container/project.container.js", () => ({
  projectController: mocks.projectController,
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
});
