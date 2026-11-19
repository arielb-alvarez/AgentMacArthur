import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectMemberService } from "../../src/project-members/project-member.service.js";

const mocks = {
  runInTransaction: vi.fn(),
  lockProject: vi.fn(),
  findOrganizationMember: vi.fn(),
  findByProjectAndUser: vi.fn(),
  findByProjectId: vi.fn(),
  createMember: vi.fn(),
  updateRole: vi.fn(),
  updateStatus: vi.fn(),
  deleteMember: vi.fn(),
  assignProjectRole: vi.fn(),
  replaceProjectPrimaryRole: vi.fn(),
  hasPermission: vi.fn(),
  hasProjectPermission: vi.fn(),
  assignProjectCustomRole: vi.fn(),
  removeProjectCustomRole: vi.fn(),
  findCustomRoleById: vi.fn(),
};

const organizationId = "org-123";
const projectId = "project-123";
const ownerId = "owner-123";
const managerId = "manager-123";
const developerId = "developer-123";

const project = {
  id: projectId,
  organizationId,
  name: "AgentMacarthur",
  description: null,
  status: "active",
  createdBy: ownerId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const owner = {
  projectId,
  organizationId,
  userId: ownerId,
  role: "project_owner",
  status: "active",
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const manager = {
  projectId,
  organizationId,
  userId: managerId,
  role: "project_manager",
  status: "active",
  joinedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const developer = {
  projectId,
  organizationId,
  userId: developerId,
  role: "developer",
  status: "active",
  joinedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const activeOrganizationMember = {
  organizationId,
  userId: managerId,
  role: "member",
  status: "active",
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("ProjectMemberService", () => {
  let service: ProjectMemberService;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    mocks.lockProject.mockResolvedValue(project);

    mocks.findOrganizationMember.mockResolvedValue(
      activeOrganizationMember
    );

    mocks.findByProjectAndUser.mockImplementation(
      async (_projectId: string, userId: string) => {
        if (userId === ownerId) return owner;
        if (userId === managerId) return manager;
        if (userId === developerId) return developer;
        return undefined;
      }
    );

    mocks.findByProjectId.mockResolvedValue([
      owner,
      manager,
      developer,
    ]);

    mocks.createMember.mockImplementation(
      async (input: Record<string, unknown>) => ({
        projectId: input.projectId,
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        joinedAt: new Date("2026-01-04T00:00:00.000Z"),
      })
    );

    mocks.updateRole.mockImplementation(
      async (
        _projectId: string,
        userId: string,
        role: string
      ) => ({
        ...(userId === ownerId
          ? owner
          : userId === managerId
            ? manager
            : developer),
        role,
      })
    );

    mocks.updateStatus.mockImplementation(
      async (
        _projectId: string,
        userId: string,
        status: string
      ) => ({
        ...(userId === ownerId ? owner : developer),
        status,
      })
    );

    mocks.deleteMember.mockResolvedValue(true);
    mocks.assignProjectRole.mockResolvedValue(undefined);
    mocks.replaceProjectPrimaryRole.mockResolvedValue(undefined);

    mocks.hasPermission.mockResolvedValue(false);
    mocks.hasProjectPermission.mockResolvedValue(true);

    mocks.assignProjectCustomRole.mockResolvedValue(undefined);
    mocks.removeProjectCustomRole.mockResolvedValue(undefined);

    mocks.findCustomRoleById.mockResolvedValue({
      id: "custom-project-role-123",
      organizationId,
      scope: "project",
      key: "qa_specialist",
      name: "QA Specialist",
      description: null,
      isSystem: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    service = new ProjectMemberService(
      {
        lockById: mocks.lockProject,
        findById: vi.fn(),
      } as never,
      {
        findByProjectAndUser: mocks.findByProjectAndUser,
        findByProjectId: mocks.findByProjectId,
        create: mocks.createMember,
        updateRole: mocks.updateRole,
        updateStatus: mocks.updateStatus,
        delete: mocks.deleteMember,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
      } as never,
      {
        assignProjectRole: mocks.assignProjectRole,
        replaceProjectPrimaryRole:
          mocks.replaceProjectPrimaryRole,
        assignProjectCustomRole: mocks.assignProjectCustomRole,
        removeProjectCustomRole: mocks.removeProjectCustomRole,
      } as never,
      {
        hasPermission: mocks.hasPermission,
        hasProjectPermission: mocks.hasProjectPermission,
      } as never,
      {
        findById: mocks.findCustomRoleById,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("add", () => {
    it("should add an active organization member and assign their project role", async () => {
      const result = await service.add(
        projectId,
        managerId,
        {
          userId: "new-user",
          role: "developer",
        }
      );

      expect(result).toMatchObject({
        userId: "new-user",
        role: "developer",
        status: "active",
      });

      expect(mocks.lockProject).toHaveBeenCalledWith(
        projectId,
        expect.any(Object)
      );

      expect(mocks.createMember).toHaveBeenCalledWith(
        {
          projectId,
          organizationId,
          userId: "new-user",
          role: "developer",
          status: "active",
        },
        expect.any(Object)
      );

      expect(mocks.assignProjectRole).toHaveBeenCalledWith(
        {
          projectId,
          organizationId,
          userId: "new-user",
          roleKey: "developer",
          assignedBy: managerId,
        },
        expect.any(Object)
      );
    });

    it("should reject users without active organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.add(projectId, managerId, {
          userId: "new-user",
          role: "developer",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.createMember).not.toHaveBeenCalled();
      expect(mocks.assignProjectRole).not.toHaveBeenCalled();
    });

    it("should reject users who are already project members", async () => {
      mocks.findByProjectAndUser.mockResolvedValue(developer);

      await expect(
        service.add(projectId, managerId, {
          userId: developerId,
          role: "developer",
        })
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.createMember).not.toHaveBeenCalled();
    });

    it("should reject users with suspended organization membership", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) => {
          if (userId === "new-user") {
            return {
              ...activeOrganizationMember,
              userId,
              status: "suspended",
            };
          }

          return activeOrganizationMember;
        }
      );

      await expect(
        service.add(projectId, managerId, {
          userId: "new-user",
          role: "developer",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.createMember).not.toHaveBeenCalled();
    });
  });

  describe("updateRole", () => {
    it("should replace the primary role for another member", async () => {
      const result = await service.updateRole(
        projectId,
        managerId,
        developerId,
        "technical_lead"
      );

      expect(result).toMatchObject({
        userId: developerId,
        role: "technical_lead",
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).toHaveBeenCalledWith(
        {
          projectId,
          organizationId,
          userId: developerId,
          roleKey: "technical_lead",
          assignedBy: managerId,
        },
        "developer",
        expect.any(Object)
      );

      expect(mocks.updateRole).toHaveBeenCalledWith(
        projectId,
        developerId,
        "technical_lead",
        expect.any(Object)
      );
    });

    it("should reject self-role changes", async () => {
      await expect(
        service.updateRole(
          projectId,
          managerId,
          managerId,
          "developer"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.runInTransaction).not.toHaveBeenCalled();
      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should protect the project owner from ordinary role changes", async () => {
      await expect(
        service.updateRole(
          projectId,
          managerId,
          ownerId,
          "project_manager"
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should allow a project manager to manage another project manager", async () => {
      mocks.findByProjectAndUser.mockResolvedValue(manager);

      const result = await service.updateRole(
        projectId,
        ownerId,
        managerId,
        "technical_lead"
      );

      expect(result).toMatchObject({
        userId: managerId,
        role: "technical_lead",
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).toHaveBeenCalledOnce();
    });

    it("should return the existing member when the requested role is unchanged", async () => {
      const result = await service.updateRole(
        projectId,
        managerId,
        developerId,
        "developer"
      );

      expect(result).toEqual(developer);
      expect(mocks.replaceProjectPrimaryRole).not.toHaveBeenCalled();
      expect(mocks.updateRole).not.toHaveBeenCalled();
    });

    it("should reject when the member disappears during a role update", async () => {
      mocks.updateRole.mockResolvedValue(undefined);

      await expect(
        service.updateRole(
          projectId,
          managerId,
          developerId,
          "technical_lead"
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("updateStatus", () => {
    it("should suspend another project member", async () => {
      const result = await service.updateStatus(
        projectId,
        managerId,
        developerId,
        "suspended"
      );

      expect(result).toMatchObject({
        userId: developerId,
        status: "suspended",
      });

      expect(mocks.updateStatus).toHaveBeenCalledWith(
        projectId,
        developerId,
        "suspended",
        expect.any(Object)
      );
    });

    it("should reject self-suspension", async () => {
      await expect(
        service.updateStatus(
          projectId,
          managerId,
          managerId,
          "suspended"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it("should protect the project owner from status changes", async () => {
      await expect(
        service.updateStatus(
          projectId,
          managerId,
          ownerId,
          "suspended"
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it("should reject when the member disappears during a status update", async () => {
      mocks.updateStatus.mockResolvedValue(undefined);

      await expect(
        service.updateStatus(
          projectId,
          managerId,
          developerId,
          "suspended"
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("remove", () => {
    it("should remove another project member", async () => {
      await expect(
        service.remove(projectId, managerId, developerId)
      ).resolves.toBeUndefined();

      expect(mocks.deleteMember).toHaveBeenCalledWith(
        projectId,
        developerId,
        expect.any(Object)
      );
    });

    it("should reject self-removal", async () => {
      await expect(
        service.remove(projectId, managerId, managerId)
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.deleteMember).not.toHaveBeenCalled();
    });

    it("should protect the project owner from removal", async () => {
      await expect(
        service.remove(projectId, managerId, ownerId)
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.deleteMember).not.toHaveBeenCalled();
    });

    it("should reject when the member cannot be deleted", async () => {
      mocks.deleteMember.mockResolvedValue(false);

      await expect(
        service.remove(projectId, managerId, developerId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("transferOwnership", () => {
    it("should transfer ownership and promote the previous owner to project manager", async () => {
      const result = await service.transferOwnership(
        projectId,
        ownerId,
        {
          newOwnerUserId: developerId,
        }
      );

      expect(result.previousOwner).toMatchObject({
        userId: ownerId,
        role: "project_manager",
      });

      expect(result.newOwner).toMatchObject({
        userId: developerId,
        role: "project_owner",
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).toHaveBeenCalledTimes(2);

      expect(
        mocks.replaceProjectPrimaryRole
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: ownerId,
          roleKey: "project_manager",
        }),
        "project_owner",
        expect.any(Object)
      );

      expect(
        mocks.replaceProjectPrimaryRole
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: developerId,
          roleKey: "project_owner",
        }),
        "developer",
        expect.any(Object)
      );

      expect(mocks.updateRole).toHaveBeenCalledTimes(2);
    });

    it("should reject an organization admin who is not the current project owner", async () => {
      mocks.hasPermission.mockResolvedValue(true);

      await expect(
        service.transferOwnership(projectId, managerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should reject inactive members as new owners", async () => {
      mocks.findByProjectAndUser.mockImplementation(
        async (_projectId: string, userId: string) => {
          if (userId === ownerId) return owner;

          return {
            ...developer,
            status: "suspended",
          };
        }
      );

      await expect(
        service.transferOwnership(projectId, ownerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should reject ownership transfer when the project has an invalid owner state", async () => {
      mocks.findByProjectId.mockResolvedValue([developer]);

      await expect(
        service.transferOwnership(projectId, ownerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should reject ownership transfer when the only owner is suspended", async () => {
      mocks.findByProjectId.mockResolvedValue([
        {
          ...owner,
          status: "suspended",
        },
        manager,
        developer,
      ]);

      await expect(
        service.transferOwnership(projectId, ownerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should reject ownership transfer when multiple owner records exist, even if one is suspended", async () => {
      mocks.findByProjectId.mockResolvedValue([
        owner,
        {
          ...manager,
          role: "project_owner",
          status: "suspended",
        },
        developer,
      ]);

      await expect(
        service.transferOwnership(projectId, ownerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });

    it("should reject ownership transfer to a project member with suspended organization membership", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) => {
          if (userId === developerId) {
            return {
              ...activeOrganizationMember,
              userId,
              status: "suspended",
            };
          }

          return {
            ...activeOrganizationMember,
            userId,
          };
        }
      );

      await expect(
        service.transferOwnership(projectId, ownerId, {
          newOwnerUserId: developerId,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(
        mocks.replaceProjectPrimaryRole
      ).not.toHaveBeenCalled();
    });
  });

  describe("custom role assignments", () => {
    const roleId = "custom-project-role-123";

    it("allows the project owner to assign a project custom role", async () => {
      await service.assignCustomRole(
        projectId,
        ownerId,
        developerId,
        roleId
      );

      expect(mocks.assignProjectCustomRole).toHaveBeenCalledWith(
        {
          projectId,
          organizationId,
          userId: developerId,
          roleId,
          assignedBy: ownerId,
        },
        expect.any(Object)
      );

      expect(mocks.hasProjectPermission).not.toHaveBeenCalled();
    });

    it("allows a member with project.members.manage to assign a project custom role", async () => {
      await service.assignCustomRole(
        projectId,
        managerId,
        developerId,
        roleId
      );

      expect(mocks.hasProjectPermission).toHaveBeenCalledWith(
        organizationId,
        projectId,
        managerId,
        "project.members.manage",
        expect.any(Object)
      );

      expect(mocks.assignProjectCustomRole).toHaveBeenCalledOnce();
    });

    it("allows the project owner to remove a project custom role", async () => {
      await service.removeCustomRole(
        projectId,
        ownerId,
        developerId,
        roleId
      );

      expect(mocks.removeProjectCustomRole).toHaveBeenCalledWith(
        {
          projectId,
          organizationId,
          userId: developerId,
          roleId,
        },
        expect.any(Object)
      );
    });

    it("rejects an organization project manager without project membership permission", async () => {
      mocks.hasPermission.mockResolvedValue(true);
      mocks.hasProjectPermission.mockResolvedValue(false);

      await expect(
        service.assignCustomRole(
          projectId,
          managerId,
          developerId,
          roleId
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.assignProjectCustomRole).not.toHaveBeenCalled();
    });

    it("rejects an inactive target project member", async () => {
      mocks.findByProjectAndUser.mockImplementation(
        async (_projectId: string, userId: string) => {
          if (userId === ownerId) return owner;

          if (userId === developerId) {
            return {
              ...developer,
              status: "suspended",
            };
          }

          return manager;
        }
      );

      await expect(
        service.assignCustomRole(
          projectId,
          ownerId,
          developerId,
          roleId
        )
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.assignProjectCustomRole).not.toHaveBeenCalled();
    });

    it("rejects organization-scoped custom roles", async () => {
      mocks.findCustomRoleById.mockResolvedValue({
        id: roleId,
        organizationId,
        scope: "organization",
        key: "organization_auditor",
        name: "Organization Auditor",
        description: null,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.assignCustomRole(
          projectId,
          ownerId,
          developerId,
          roleId
        )
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.assignProjectCustomRole).not.toHaveBeenCalled();
    });

    it("rejects missing custom roles", async () => {
      mocks.findCustomRoleById.mockResolvedValue(undefined);

      await expect(
        service.assignCustomRole(
          projectId,
          ownerId,
          developerId,
          roleId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.assignProjectCustomRole).not.toHaveBeenCalled();
    });

    it("treats repeated assignment as repository-idempotent", async () => {
      await service.assignCustomRole(
        projectId,
        ownerId,
        developerId,
        roleId
      );

      await service.assignCustomRole(
        projectId,
        ownerId,
        developerId,
        roleId
      );

      expect(mocks.assignProjectCustomRole).toHaveBeenCalledTimes(2);
    });

    it("allows removing an existing custom role without changing the member's base role", async () => {
      await service.removeCustomRole(
        projectId,
        managerId,
        developerId,
        roleId
      );

      expect(mocks.removeProjectCustomRole).toHaveBeenCalledOnce();
      expect(mocks.updateRole).not.toHaveBeenCalled();
      expect(mocks.replaceProjectPrimaryRole).not.toHaveBeenCalled();
    });
  });
});
