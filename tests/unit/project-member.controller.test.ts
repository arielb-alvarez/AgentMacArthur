import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createProjectMemberController } from "../../src/controllers/project-member.controller.js";
import type { ProjectMemberService } from "../../src/project-members/project-member.service.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const memberUserId = "33333333-3333-4333-8333-333333333333";

const testMember = {
  projectId,
  userId: memberUserId,
  role: "developer",
  status: "active",
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
      : { user: { id: actorUserId } },
    body: options.body ?? {},
  }) as unknown as Request;

const createResponse = (
  params: Record<string, string> = {}
) => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  locals: {
    validatedRequest: { params },
  },
});

describe("Project Member Controller", () => {
  let projectMemberService: {
    list: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    transferOwnership: ReturnType<typeof vi.fn>;
  };

  let controller: ReturnType<typeof createProjectMemberController>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    projectMemberService = {
      list: vi.fn(),
      add: vi.fn(),
      updateRole: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
      transferOwnership: vi.fn(),
    };

    controller = createProjectMemberController(
      projectMemberService as unknown as ProjectMemberService
    );

    next = vi.fn();
  });

  it("should list project members", async () => {
    projectMemberService.list.mockResolvedValue([testMember]);

    const res = createResponse({ projectId });

    await controller.list(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.list).toHaveBeenCalledWith(
      projectId,
      actorUserId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      members: [testMember],
    });
  });

  it("should add a project member", async () => {
    const body = {
      userId: memberUserId,
      role: "developer",
    };

    projectMemberService.add.mockResolvedValue(testMember);

    const res = createResponse({ projectId });

    await controller.add(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.add).toHaveBeenCalledWith(
      projectId,
      actorUserId,
      body
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project member added successfully.",
      member: testMember,
    });
  });

  it("should update a member role", async () => {
    const body = { role: "technical_lead" };
    const updatedMember = { ...testMember, role: "technical_lead" };

    projectMemberService.updateRole.mockResolvedValue(updatedMember);

    const res = createResponse({ projectId, userId: memberUserId });

    await controller.updateRole(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.updateRole).toHaveBeenCalledWith(
      projectId,
      actorUserId,
      memberUserId,
      "technical_lead"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project member role updated successfully.",
      member: updatedMember,
    });
  });

  it("should update a member status", async () => {
    const body = { status: "suspended" };
    const updatedMember = { ...testMember, status: "suspended" };

    projectMemberService.updateStatus.mockResolvedValue(updatedMember);

    const res = createResponse({ projectId, userId: memberUserId });

    await controller.updateStatus(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.updateStatus).toHaveBeenCalledWith(
      projectId,
      actorUserId,
      memberUserId,
      "suspended"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project member status updated successfully.",
      member: updatedMember,
    });
  });

  it("should remove a project member", async () => {
    projectMemberService.remove.mockResolvedValue(undefined);

    const res = createResponse({ projectId, userId: memberUserId });

    await controller.remove(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.remove).toHaveBeenCalledWith(
      projectId,
      actorUserId,
      memberUserId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project member removed successfully.",
    });
  });

  it("should transfer project ownership", async () => {
    const body = { newOwnerUserId: memberUserId };
    const result = {
      previousOwner: { ...testMember, role: "project_manager" },
      newOwner: { ...testMember, role: "project_owner" },
    };

    projectMemberService.transferOwnership.mockResolvedValue(result);

    const res = createResponse({ projectId });

    await controller.transferOwnership(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(projectMemberService.transferOwnership).toHaveBeenCalledWith(
      projectId,
      actorUserId,
      body
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Project ownership transferred successfully.",
      ...result,
    });
  });

  it.each([
    ["list", "list"],
    ["add", "add"],
    ["updateRole", "updateRole"],
    ["updateStatus", "updateStatus"],
    ["remove", "remove"],
    ["transferOwnership", "transferOwnership"],
  ] as const)(
    "should reject unauthenticated %s requests",
    async (method, serviceMethod) => {
      const res = createResponse({ projectId, userId: memberUserId });

      await controller[method](
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
      expect(projectMemberService[serviceMethod]).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["list", () => projectMemberService.list.mockRejectedValue(new Error("List failed"))],
    ["add", () => projectMemberService.add.mockRejectedValue(new Error("Add failed"))],
    ["updateRole", () => projectMemberService.updateRole.mockRejectedValue(new Error("Role update failed"))],
    ["updateStatus", () => projectMemberService.updateStatus.mockRejectedValue(new Error("Status update failed"))],
    ["remove", () => projectMemberService.remove.mockRejectedValue(new Error("Remove failed"))],
    ["transferOwnership", () => projectMemberService.transferOwnership.mockRejectedValue(new Error("Transfer failed"))],
  ] as const)(
    "should forward %s service errors to next middleware",
    async (method, rejectService) => {
      rejectService();

      const res = createResponse({ projectId, userId: memberUserId });

      await controller[method](
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.status).not.toHaveBeenCalled();
    }
  );
});
