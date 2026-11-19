import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createProjectController } from "../../src/controllers/project.controller.js";
import type { ProjectService } from "../../src/projects/project.service.js";

const userId = "user-123";
const projectId = "project-123";

const testProject = {
  id: projectId,
  name: "Test Project",
};

const createRequest = (
  options: {
    authenticated?: boolean;
    body?: Record<string, unknown>;
  } = {}
) =>
  ({
    auth: options.authenticated === false
      ? undefined
      : { user: { id: userId } },
    body: options.body ?? {},
  }) as unknown as Request;

const createResponse = (
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  locals: {
    validatedRequest: { params, query },
  },
});

describe("Project Controller", () => {
  let projectService: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };

  let controller: ReturnType<typeof createProjectController>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    projectService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    controller = createProjectController(
      projectService as unknown as ProjectService
    );

    next = vi.fn();
  });

  it("should create a project for the authenticated user", async () => {
    const body = {
      organizationId: "organization-123",
      name: "New Project",
    };

    projectService.create.mockResolvedValue(testProject);

    const res = createResponse();

    await controller.create(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.create).toHaveBeenCalledWith(userId, body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project created successfully.",
      project: testProject,
    });
  });

  it("should list projects using the validated organization filter", async () => {
    projectService.list.mockResolvedValue([testProject]);

    const res = createResponse({}, {
      organizationId: "organization-123",
    });

    await controller.list(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.list).toHaveBeenCalledWith(
      userId,
      "organization-123"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      projects: [testProject],
    });
  });

  it("should list projects without an organization filter", async () => {
    projectService.list.mockResolvedValue([testProject]);

    const res = createResponse();

    await controller.list(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.list).toHaveBeenCalledWith(userId, undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should get a project by ID", async () => {
    projectService.getById.mockResolvedValue(testProject);

    const res = createResponse({ projectId });

    await controller.getById(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.getById).toHaveBeenCalledWith(
      projectId,
      userId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: testProject,
    });
  });

  it("should update a project", async () => {
    const body = { name: "Updated Project" };
    const updatedProject = { ...testProject, ...body };

    projectService.update.mockResolvedValue(updatedProject);

    const res = createResponse({ projectId });

    await controller.update(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.update).toHaveBeenCalledWith(
      projectId,
      userId,
      body
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project updated successfully.",
      project: updatedProject,
    });
  });

  it("should update project status", async () => {
    const body = { status: "active" };
    const updatedProject = { ...testProject, status: "active" };

    projectService.updateStatus.mockResolvedValue(updatedProject);

    const res = createResponse({ projectId });

    await controller.updateStatus(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectService.updateStatus).toHaveBeenCalledWith(
      projectId,
      userId,
      "active"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project status updated successfully.",
      project: updatedProject,
    });
  });

  it("should reject unauthenticated requests", async () => {
    const res = createResponse();

    await controller.create(
      createRequest({ authenticated: false }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication required.",
        statusCode: 401,
      })
    );
    expect(projectService.create).not.toHaveBeenCalled();
  });

  it.each([
    ["create", () => projectService.create.mockRejectedValue(new Error("Create failed"))],
    ["list", () => projectService.list.mockRejectedValue(new Error("List failed"))],
    ["getById", () => projectService.getById.mockRejectedValue(new Error("Get failed"))],
    ["update", () => projectService.update.mockRejectedValue(new Error("Update failed"))],
    ["updateStatus", () => projectService.updateStatus.mockRejectedValue(new Error("Status update failed"))],
  ] as const)(
    "should forward %s service errors to next middleware",
    async (method, rejectService) => {
      rejectService();

      const res = createResponse({ projectId });
      const req = createRequest();

      await controller[method](
        req,
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.status).not.toHaveBeenCalled();
    }
  );
});
