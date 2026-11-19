import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleManagementService } from "../../src/role-management/role-management.service.js";

import type { Organization } from "../../src/organizations/organization.types.js";
import type { OrganizationMember } from "../../src/organization-members/organization-member.types.js";
import type { ManagedRole } from "../../src/role-management/role-management.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  findOrganizationById: vi.fn(),
  findOrganizationMember: vi.fn(),
  findOrganizationBaseRoles: vi.fn(),
  findAllRoles: vi.fn(),
  findPermissions: vi.fn(),
  createCustomRole: vi.fn(),
  updateCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(),
  replacePermissions: vi.fn(),
  findManagedRoleById: vi.fn(),
  assignOrganizationCustomRole: vi.fn(),
  removeOrganizationCustomRole: vi.fn(),
};

describe("RoleManagementService", () => {
  let service: RoleManagementService;

  const organizationId = "org-123";
  const ownerId = "owner-123";
  const adminId = "admin-123";
  const memberId = "member-123";
  const roleId = "role-123";

  const transactionClient = {};

  const organization: Organization = {
    id: organizationId,
    name: "AgentMacarthur",
    slug: "agentmacarthur",
    type: "team",
    ownerUserId: ownerId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const ownerMembership: OrganizationMember = {
    organizationId,
    userId: ownerId,
    role: "owner",
    status: "active",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const adminMembership: OrganizationMember = {
    organizationId,
    userId: adminId,
    role: "admin",
    status: "active",
    joinedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  const memberMembership: OrganizationMember = {
    organizationId,
    userId: memberId,
    role: "member",
    status: "active",
    joinedAt: new Date("2026-01-03T00:00:00.000Z"),
  };

  const customRole: ManagedRole = {
    id: roleId,
    organizationId,
    scope: "organization",
    key: "custom_analyst",
    name: "Analyst",
    description: "Custom analyst role",
    isSystem: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const permission = {
    id: "permission-123",
    scope: "organization" as const,
    key: "organization.projects.view",
    description: "View organization projects.",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation(transactionClient)
    );

    mocks.findOrganizationById.mockResolvedValue(organization);

    mocks.findOrganizationMember.mockImplementation(
      async (_organizationId: string, userId: string) => {
        if (userId === ownerId) return ownerMembership;
        if (userId === adminId) return adminMembership;
        if (userId === memberId) return memberMembership;
        return undefined;
      }
    );

    mocks.findOrganizationBaseRoles.mockImplementation(
      async (_organizationId: string, userId: string) => {
        if (userId === ownerId) return ["owner"];
        if (userId === adminId) return ["admin"];
        if (userId === memberId) return ["member"];
        return [];
      }
    );

    mocks.findAllRoles.mockResolvedValue([customRole]);
    mocks.findPermissions.mockResolvedValue([permission]);
    mocks.createCustomRole.mockResolvedValue(customRole);
    mocks.updateCustomRole.mockResolvedValue(customRole);
    mocks.deleteCustomRole.mockResolvedValue("deleted");
    mocks.replacePermissions.mockResolvedValue(undefined);
    mocks.findManagedRoleById.mockResolvedValue(customRole);
    mocks.assignOrganizationCustomRole.mockResolvedValue(undefined);
    mocks.removeOrganizationCustomRole.mockResolvedValue(undefined);

    service = new RoleManagementService(
      {
        findById: mocks.findOrganizationById,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
      } as never,
      {
        findOrganizationBaseRoles:
          mocks.findOrganizationBaseRoles,
        assignOrganizationCustomRole:
          mocks.assignOrganizationCustomRole,
        removeOrganizationCustomRole:
          mocks.removeOrganizationCustomRole,
      } as never,
      {
        findAllByOrganizationId: mocks.findAllRoles,
        findById: mocks.findManagedRoleById,
        findPermissionsByScope: mocks.findPermissions,
        createCustomRole: mocks.createCustomRole,
        updateCustomRole: mocks.updateCustomRole,
        deleteCustomRole: mocks.deleteCustomRole,
        replacePermissions: mocks.replacePermissions,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("authorization", () => {
    it("allows an active organization owner with a matching canonical base role", async () => {
      const result = await service.listRoles(
        organizationId,
        ownerId
      );

      expect(result).toEqual([customRole]);

      expect(mocks.findOrganizationBaseRoles).toHaveBeenCalledWith(
        organizationId,
        ownerId,
        transactionClient
      );

      expect(mocks.findAllRoles).toHaveBeenCalledWith(
        organizationId,
        undefined,
        transactionClient
      );
    });

    it("allows an active organization admin with a matching canonical base role", async () => {
      const result = await service.listRoles(
        organizationId,
        adminId
      );

      expect(result).toEqual([customRole]);

      expect(mocks.findOrganizationBaseRoles).toHaveBeenCalledWith(
        organizationId,
        adminId,
        transactionClient
      );
    });

    it("denies ordinary organization members", async () => {
      await expect(
        service.listRoles(organizationId, memberId)
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("denies users with project-level roles but no organization admin role", async () => {
      mocks.findOrganizationMember.mockResolvedValue(
        memberMembership
      );
      mocks.findOrganizationBaseRoles.mockResolvedValue([
        "member",
      ]);

      await expect(
        service.listRoles(organizationId, memberId)
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("denies suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...adminMembership,
        status: "suspended",
      });

      await expect(
        service.listRoles(organizationId, adminId)
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(
        mocks.findOrganizationBaseRoles
      ).not.toHaveBeenCalled();

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("denies users without organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.listRoles(organizationId, "unknown-user")
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(
        mocks.findOrganizationBaseRoles
      ).not.toHaveBeenCalled();
    });

    it("returns 404 when the organization does not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.listRoles(organizationId, ownerId)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(
        mocks.findOrganizationMember
      ).not.toHaveBeenCalled();
    });

    it("rejects an owner whose membership role is inconsistent", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...ownerMembership,
        role: "admin",
      });

      await expect(
        service.listRoles(organizationId, ownerId)
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("rejects an owner whose canonical base role is inconsistent", async () => {
      mocks.findOrganizationBaseRoles.mockResolvedValue([
        "admin",
      ]);

      await expect(
        service.listRoles(organizationId, ownerId)
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("rejects an admin whose membership and canonical base roles disagree", async () => {
      mocks.findOrganizationBaseRoles.mockResolvedValue([
        "member",
      ]);

      await expect(
        service.listRoles(organizationId, adminId)
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.findAllRoles).not.toHaveBeenCalled();
    });

    it("rejects admins with multiple canonical base roles", async () => {
      mocks.findOrganizationBaseRoles.mockResolvedValue([
        "admin",
        "member",
      ]);

      await expect(
        service.listRoles(organizationId, adminId)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("does not authorize an organization admin through a custom role alone", async () => {
      mocks.findOrganizationBaseRoles.mockResolvedValue([
        "member",
      ]);

      await expect(
        service.listRoles(organizationId, adminId)
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("listRoles", () => {
    it("passes the requested scope to the repository", async () => {
      await service.listRoles(
        organizationId,
        ownerId,
        "project"
      );

      expect(mocks.findAllRoles).toHaveBeenCalledWith(
        organizationId,
        "project",
        transactionClient
      );
    });
  });

  describe("listPermissions", () => {
    it("returns permission definitions for the requested scope", async () => {
      const result = await service.listPermissions(
        organizationId,
        ownerId,
        "organization"
      );

      expect(result).toEqual([permission]);

      expect(mocks.findPermissions).toHaveBeenCalledWith(
        "organization",
        transactionClient
      );
    });

    it("denies permission catalog access to ordinary members", async () => {
      await expect(
        service.listPermissions(
          organizationId,
          memberId,
          "organization"
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.findPermissions).not.toHaveBeenCalled();
    });
  });

  describe("createRole", () => {
    it("creates a custom role for an authorized owner", async () => {
      const result = await service.createRole(
        organizationId,
        ownerId,
        {
          scope: "organization",
          key: "custom_analyst",
          name: "Analyst",
        }
      );

      expect(result).toEqual(customRole);

      expect(mocks.createCustomRole).toHaveBeenCalledWith(
        {
          organizationId,
          scope: "organization",
          key: "custom_analyst",
          name: "Analyst",
        },
        transactionClient
      );
    });

    it("allows an authorized admin to create a custom role", async () => {
      await service.createRole(organizationId, adminId, {
        scope: "project",
        key: "custom_reviewer",
        name: "Reviewer",
      });

      expect(mocks.createCustomRole).toHaveBeenCalled();
    });

    it("maps duplicate role keys to HTTP 409", async () => {
      mocks.createCustomRole.mockRejectedValue({
        code: "23505",
      });

      await expect(
        service.createRole(organizationId, ownerId, {
          scope: "organization",
          key: "custom_analyst",
          name: "Analyst",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("does not create roles for unauthorized members", async () => {
      await expect(
        service.createRole(organizationId, memberId, {
          scope: "organization",
          key: "custom_analyst",
          name: "Analyst",
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.createCustomRole).not.toHaveBeenCalled();
    });
  });

  describe("updateRole", () => {
    it("updates custom role metadata", async () => {
      const result = await service.updateRole(
        organizationId,
        ownerId,
        roleId,
        {
          name: "Updated Analyst",
          description: "Updated description",
        }
      );

      expect(result).toEqual(customRole);

      expect(mocks.updateCustomRole).toHaveBeenCalledWith(
        {
          organizationId,
          roleId,
          name: "Updated Analyst",
          description: "Updated description",
        },
        transactionClient
      );
    });

    it("returns 404 when the custom role does not exist", async () => {
      mocks.updateCustomRole.mockResolvedValue(undefined);

      await expect(
        service.updateRole(
          organizationId,
          ownerId,
          roleId,
          { name: "Updated Analyst" }
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("deleteRole", () => {
    it("deletes an unassigned custom role", async () => {
      await expect(
        service.deleteRole(
          organizationId,
          ownerId,
          roleId
        )
      ).resolves.toBeUndefined();

      expect(mocks.deleteCustomRole).toHaveBeenCalledWith(
        organizationId,
        roleId,
        transactionClient
      );
    });

    it("returns 404 when the custom role does not exist", async () => {
      mocks.deleteCustomRole.mockResolvedValue("not_found");

      await expect(
        service.deleteRole(
          organizationId,
          ownerId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns 409 when the custom role is still assigned", async () => {
      mocks.deleteCustomRole.mockResolvedValue("assigned");

      await expect(
        service.deleteRole(
          organizationId,
          ownerId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("replacePermissions", () => {
    it("replaces permissions for an authorized custom role", async () => {
      await expect(
        service.replacePermissions(
          organizationId,
          ownerId,
          roleId,
          [permission.id]
        )
      ).resolves.toBeUndefined();

      expect(mocks.replacePermissions).toHaveBeenCalledWith(
        organizationId,
        roleId,
        [permission.id],
        transactionClient
      );
    });

    it("returns 404 when the custom role does not exist", async () => {
      mocks.replacePermissions.mockRejectedValue(
        new Error(
          "Custom role not found in the specified organization."
        )
      );

      await expect(
        service.replacePermissions(
          organizationId,
          ownerId,
          roleId,
          []
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns 400 when permissions do not match the role scope", async () => {
      mocks.replacePermissions.mockRejectedValue(
        new Error(
          "One or more permissions do not exist or do not match the custom role scope."
        )
      );

      await expect(
        service.replacePermissions(
          organizationId,
          ownerId,
          roleId,
          [permission.id]
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("does not replace permissions for unauthorized members", async () => {
      await expect(
        service.replacePermissions(
          organizationId,
          memberId,
          roleId,
          [permission.id]
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.replacePermissions).not.toHaveBeenCalled();
    });
  });

  describe("organization custom-role assignments", () => {
    it("allows an organization owner to assign a custom role", async () => {
      await service.assignOrganizationCustomRole(
        organizationId,
        ownerId,
        memberId,
        roleId
      );

      expect(mocks.findManagedRoleById).toHaveBeenCalledWith(
        organizationId,
        roleId,
        transactionClient
      );

      expect(
        mocks.assignOrganizationCustomRole
      ).toHaveBeenCalledWith(
        {
          organizationId,
          userId: memberId,
          roleId,
          assignedBy: ownerId,
        },
        transactionClient
      );
    });

    it("allows an organization admin to remove a custom role", async () => {
      await service.removeOrganizationCustomRole(
        organizationId,
        adminId,
        memberId,
        roleId
      );

      expect(
        mocks.removeOrganizationCustomRole
      ).toHaveBeenCalledWith(
        {
          organizationId,
          userId: memberId,
          roleId,
          assignedBy: adminId,
        },
        transactionClient
      );
    });

    it("denies ordinary members from assigning custom roles", async () => {
      await expect(
        service.assignOrganizationCustomRole(
          organizationId,
          memberId,
          ownerId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(
        mocks.assignOrganizationCustomRole
      ).not.toHaveBeenCalled();
    });

    it("rejects inactive target organization members", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) => {
          if (userId === ownerId) return ownerMembership;
          if (userId === memberId) {
            return {
              ...memberMembership,
              status: "suspended",
            };
          }
          return undefined;
        }
      );

      await expect(
        service.assignOrganizationCustomRole(
          organizationId,
          ownerId,
          memberId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(
        mocks.assignOrganizationCustomRole
      ).not.toHaveBeenCalled();
    });

    it("rejects a role belonging to another organization or not found", async () => {
      mocks.findManagedRoleById.mockResolvedValue(undefined);

      await expect(
        service.assignOrganizationCustomRole(
          organizationId,
          ownerId,
          memberId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(
        mocks.assignOrganizationCustomRole
      ).not.toHaveBeenCalled();
    });

    it("rejects project-scoped custom roles", async () => {
      mocks.findManagedRoleById.mockResolvedValue({
        ...customRole,
        scope: "project",
      });

      await expect(
        service.assignOrganizationCustomRole(
          organizationId,
          ownerId,
          memberId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(
        mocks.assignOrganizationCustomRole
      ).not.toHaveBeenCalled();
    });

    it("rejects system roles", async () => {
      mocks.findManagedRoleById.mockResolvedValue({
        ...customRole,
        isSystem: true,
      });

      await expect(
        service.removeOrganizationCustomRole(
          organizationId,
          ownerId,
          memberId,
          roleId
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(
        mocks.removeOrganizationCustomRole
      ).not.toHaveBeenCalled();
    });
  });

  describe("transaction handling", () => {
    it("runs each operation through the transaction manager", async () => {
      await service.listRoles(organizationId, ownerId);
      await service.listPermissions(
        organizationId,
        ownerId,
        "organization"
      );
      await service.createRole(organizationId, ownerId, {
        scope: "organization",
        key: "custom_analyst",
        name: "Analyst",
      });
      await service.updateRole(
        organizationId,
        ownerId,
        roleId,
        { name: "Updated Analyst" }
      );
      await service.deleteRole(
        organizationId,
        ownerId,
        roleId
      );
      await service.replacePermissions(
        organizationId,
        ownerId,
        roleId,
        []
      );
      await service.assignOrganizationCustomRole(
        organizationId,
        ownerId,
        memberId,
        roleId
      );
      await service.removeOrganizationCustomRole(
        organizationId,
        ownerId,
        memberId,
        roleId
      );

      expect(mocks.runInTransaction).toHaveBeenCalledTimes(8);
    });
  });
});
