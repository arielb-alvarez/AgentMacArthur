import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectService } from "../../src/projects/project.service.js";

import type { Project } from "../../src/projects/project.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  createProject: vi.fn(),
  findProjectById: vi.fn(),
  findAccessibleByUserId: vi.fn(),
  updateProject: vi.fn(),
  updateProjectStatus: vi.fn(),
  findOrganizationMember: vi.fn(),
  createProjectMember: vi.fn(),
  findProjectMember: vi.fn(),
  assignProjectRole: vi.fn(),
};

describe("ProjectService", () => {
  let service: ProjectService;

  const userId = "user-123";
  const organizationId = "org-123";

  const project: Project = {
    id: "project-123",
    organizationId,
    name: "AgentMacarthur",
    description: "AI-powered project management platform",
    status: "draft",
    createdBy: userId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const activeOrganizationMember = {
    organizationId,
    userId,
    role: "member" as const,
    status: "active" as const,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const activeProjectMember = {
    projectId: project.id,
    organizationId,
    userId,
    role: "developer" as const,
    status: "active" as const,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    mocks.createProject.mockResolvedValue(project);
    mocks.findProjectById.mockResolvedValue(project);
    mocks.findAccessibleByUserId.mockResolvedValue([project]);
    mocks.updateProject.mockResolvedValue(project);
    mocks.updateProjectStatus.mockResolvedValue(project);
    mocks.assignProjectRole.mockResolvedValue(undefined);

    mocks.findOrganizationMember.mockResolvedValue(
      activeOrganizationMember
    );

    mocks.createProjectMember.mockResolvedValue({});
    mocks.findProjectMember.mockResolvedValue(activeProjectMember);

    service = new ProjectService(
      {
        create: mocks.createProject,
        findById: mocks.findProjectById,
        findAccessibleByUserId: mocks.findAccessibleByUserId,
        update: mocks.updateProject,
        updateStatus: mocks.updateProjectStatus,
      } as never,
      {
        create: mocks.createProjectMember,
        findByProjectAndUser: mocks.findProjectMember,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
      } as never,
      {
        assignProjectRole: mocks.assignProjectRole,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("create", () => {
    it("should create a project and assign the creator as project owner", async () => {
      const result = await service.create(userId, {
        organizationId,
        name: "  AgentMacarthur  ",
        description: "  AI project platform  ",
      });

      expect(result).toEqual(project);

      expect(mocks.findOrganizationMember).toHaveBeenCalledWith(
        organizationId,
        userId,
        expect.any(Object)
      );

      expect(mocks.createProject).toHaveBeenCalledWith(
        {
          organizationId,
          name: "AgentMacarthur",
          description: "AI project platform",
          createdBy: userId,
        },
        expect.any(Object)
      );

      expect(mocks.createProjectMember).toHaveBeenCalledWith(
        {
          projectId: project.id,
          organizationId,
          userId,
          role: "project_owner",
          status: "active",
        },
        expect.any(Object)
      );

      expect(mocks.assignProjectRole).toHaveBeenCalledWith(
        {
          projectId: project.id,
          organizationId,
          userId,
          roleKey: "project_owner",
          assignedBy: userId,
        },
        expect.any(Object)
      );
    });

    it("should reject users without active organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.create(userId, {
          organizationId,
          name: "Unauthorized Project",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.createProject).not.toHaveBeenCalled();
      expect(mocks.createProjectMember).not.toHaveBeenCalled();
    });

    it("should reject suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        status: "suspended",
      });

      await expect(
        service.create(userId, {
          organizationId,
          name: "Unauthorized Project",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.createProject).not.toHaveBeenCalled();
    });

    it("should propagate errors when project membership creation fails", async () => {
      mocks.createProjectMember.mockRejectedValue(
        new Error("Membership creation failed")
      );

      await expect(
        service.create(userId, {
          organizationId,
          name: "Test Project",
        })
      ).rejects.toThrow("Membership creation failed");
    });

    it("should propagate errors when project owner role assignment fails", async () => {
      mocks.assignProjectRole.mockRejectedValue(
        new Error("Project owner role assignment failed")
      );

      await expect(
        service.create(userId, {
          organizationId,
          name: "Test Project",
        })
      ).rejects.toThrow("Project owner role assignment failed");

      expect(mocks.createProject).toHaveBeenCalledOnce();
      expect(mocks.createProjectMember).toHaveBeenCalledOnce();
    });
  });

  describe("list", () => {
    it("should list projects accessible to the current user", async () => {
      const result = await service.list(userId);

      expect(result).toEqual([project]);

      expect(mocks.findAccessibleByUserId).toHaveBeenCalledWith(
        userId,
        undefined
      );
    });

    it("should filter accessible projects by organization", async () => {
      await service.list(userId, organizationId);

      expect(mocks.findAccessibleByUserId).toHaveBeenCalledWith(
        userId,
        organizationId
      );
    });
  });

  describe("getById", () => {
    it("should allow an active project member to view a project", async () => {
      const result = await service.getById(project.id, userId);

      expect(result).toEqual(project);

      expect(mocks.findProjectMember).toHaveBeenCalledWith(
        project.id,
        userId,
        expect.any(Object)
      );
    });

    it("should allow organization admins without project membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        role: "admin",
      });

      const result = await service.getById(project.id, userId);

      expect(result).toEqual(project);
      expect(mocks.findProjectMember).not.toHaveBeenCalled();
    });

    it("should deny suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        status: "suspended",
      });

      await expect(
        service.getById(project.id, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should deny suspended project members", async () => {
      mocks.findProjectMember.mockResolvedValue({
        ...activeProjectMember,
        status: "suspended",
      });

      await expect(
        service.getById(project.id, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should hide projects that do not exist", async () => {
      mocks.findProjectById.mockResolvedValue(undefined);

      await expect(
        service.getById("missing-project", userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should allow project managers to update project details", async () => {
      mocks.findProjectMember.mockResolvedValue({
        ...activeProjectMember,
        role: "project_manager",
      });

      const result = await service.update(project.id, userId, {
        name: "Updated Project",
      });

      expect(result).toEqual(project);

      expect(mocks.updateProject).toHaveBeenCalledWith(
        project.id,
        organizationId,
        { name: "Updated Project" },
        expect.any(Object)
      );
    });

    it("should allow organization owners without project membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        role: "owner",
      });

      await service.update(project.id, userId, {
        name: "Updated Project",
      });

      expect(mocks.updateProject).toHaveBeenCalledOnce();
      expect(mocks.findProjectMember).not.toHaveBeenCalled();
    });

    it("should deny developers from updating project details", async () => {
      await expect(
        service.update(project.id, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("should hide projects from users without organization access", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.update(project.id, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.updateProject).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("should allow project owners to change project status", async () => {
      mocks.findProjectMember.mockResolvedValue({
        ...activeProjectMember,
        role: "project_owner",
      });

      const result = await service.updateStatus(
        project.id,
        userId,
        "active"
      );

      expect(result).toEqual(project);

      expect(mocks.updateProjectStatus).toHaveBeenCalledWith(
        project.id,
        organizationId,
        { status: "active" },
        expect.any(Object)
      );
    });

    it("should allow project managers to change project status", async () => {
      mocks.findProjectMember.mockResolvedValue({
        ...activeProjectMember,
        role: "project_manager",
      });

      await service.updateStatus(project.id, userId, "on_hold");

      expect(mocks.updateProjectStatus).toHaveBeenCalledOnce();
    });

    it("should deny clients from changing project status", async () => {
      mocks.findProjectMember.mockResolvedValue({
        ...activeProjectMember,
        role: "client",
      });

      await expect(
        service.updateStatus(project.id, userId, "completed")
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProjectStatus).not.toHaveBeenCalled();
    });
  });
});
