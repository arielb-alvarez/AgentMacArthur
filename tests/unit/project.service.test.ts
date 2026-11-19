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
  assignProjectRole: vi.fn(),
  assertPermission: vi.fn(),
  hasPermission: vi.fn(),
  hasProjectPermission: vi.fn(),
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

    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.hasPermission.mockResolvedValue(false);
    mocks.hasProjectPermission.mockResolvedValue(false);

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
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
      } as never,
      {
        assignProjectRole: mocks.assignProjectRole,
      } as never,
      {
        assertPermission: mocks.assertPermission,
        hasPermission: mocks.hasPermission,
        hasProjectPermission: mocks.hasProjectPermission,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("create", () => {
    it("should require project.create and assign the creator as project owner", async () => {
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

      expect(mocks.assertPermission).toHaveBeenCalledWith(
        organizationId,
        userId,
        "project.create",
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

      expect(mocks.assertPermission).not.toHaveBeenCalled();
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

      expect(mocks.assertPermission).not.toHaveBeenCalled();
      expect(mocks.createProject).not.toHaveBeenCalled();
    });

    it("should reject project creation when project.create is denied", async () => {
      mocks.assertPermission.mockRejectedValue(
        Object.assign(new Error("Forbidden"), {
          statusCode: 403,
        })
      );

      await expect(
        service.create(userId, {
          organizationId,
          name: "Unauthorized Project",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.createProject).not.toHaveBeenCalled();
      expect(mocks.createProjectMember).not.toHaveBeenCalled();
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
    it("should allow project-specific view permission", async () => {
      mocks.hasProjectPermission.mockResolvedValue(true);

      const result = await service.getById(project.id, userId);

      expect(result).toEqual(project);

      expect(mocks.hasPermission).toHaveBeenCalledWith(
        organizationId,
        userId,
        "organization.projects.view",
        expect.any(Object)
      );

      expect(mocks.hasProjectPermission).toHaveBeenCalledWith(
        organizationId,
        project.id,
        userId,
        "project.view",
        expect.any(Object)
      );
    });

    it("should allow organization-wide project view permission", async () => {
      mocks.hasPermission.mockResolvedValue(true);

      const result = await service.getById(project.id, userId);

      expect(result).toEqual(project);
      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
    });

    it("should not grant access based only on the legacy organization owner role", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        role: "owner",
      });

      await expect(
        service.getById(project.id, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.hasProjectPermission).toHaveBeenCalled();
    });

    it("should hide projects from users without project view permission", async () => {
      await expect(
        service.getById(project.id, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
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

      expect(mocks.hasPermission).not.toHaveBeenCalled();
      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
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
    it("should allow project.update permission", async () => {
      mocks.hasProjectPermission.mockResolvedValue(true);

      const result = await service.update(project.id, userId, {
        name: "Updated Project",
      });

      expect(result).toEqual(project);

      expect(mocks.hasProjectPermission).toHaveBeenCalledWith(
        organizationId,
        project.id,
        userId,
        "project.update",
        expect.any(Object)
      );

      expect(mocks.updateProject).toHaveBeenCalledWith(
        project.id,
        organizationId,
        { name: "Updated Project" },
        expect.any(Object)
      );
    });

    it("should allow organization-wide project management permission", async () => {
      mocks.hasPermission.mockResolvedValue(true);

      await service.update(project.id, userId, {
        name: "Updated Project",
      });

      expect(mocks.hasPermission).toHaveBeenCalledWith(
        organizationId,
        userId,
        "organization.projects.manage",
        expect.any(Object)
      );

      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
      expect(mocks.updateProject).toHaveBeenCalledOnce();
    });

    it("should not grant update access based only on the legacy organization owner role", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        role: "owner",
      });

      await expect(
        service.update(project.id, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("should deny users without project.update permission", async () => {
      await expect(
        service.update(project.id, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("should hide projects from users without active organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.update(project.id, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.hasPermission).not.toHaveBeenCalled();
      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
      expect(mocks.updateProject).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("should allow project.change_status permission", async () => {
      mocks.hasProjectPermission.mockResolvedValue(true);

      const result = await service.updateStatus(
        project.id,
        userId,
        "active"
      );

      expect(result).toEqual(project);

      expect(mocks.hasProjectPermission).toHaveBeenCalledWith(
        organizationId,
        project.id,
        userId,
        "project.change_status",
        expect.any(Object)
      );

      expect(mocks.updateProjectStatus).toHaveBeenCalledWith(
        project.id,
        organizationId,
        { status: "active" },
        expect.any(Object)
      );
    });

    it("should allow organization-wide project management permission", async () => {
      mocks.hasPermission.mockResolvedValue(true);

      await service.updateStatus(project.id, userId, "on_hold");

      expect(mocks.hasPermission).toHaveBeenCalledWith(
        organizationId,
        userId,
        "organization.projects.manage",
        expect.any(Object)
      );

      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
      expect(mocks.updateProjectStatus).toHaveBeenCalledOnce();
    });

    it("should deny users without project.change_status permission", async () => {
      await expect(
        service.updateStatus(project.id, userId, "completed")
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProjectStatus).not.toHaveBeenCalled();
    });

    it("should not grant status access based only on the legacy project owner role", async () => {
      mocks.hasProjectPermission.mockResolvedValue(false);

      await expect(
        service.updateStatus(project.id, userId, "completed")
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateProjectStatus).not.toHaveBeenCalled();
    });
  });
});