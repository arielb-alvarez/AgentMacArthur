import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationService } from "../../src/organizations/organization.service.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

import type { Organization } from "../../src/organizations/organization.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  findOrganizationById: vi.fn(),
  findOrganizationByIdForUpdate: vi.fn(),
  findOrganizationsByUserId: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationOwner: vi.fn(),
  findOrganizationMember: vi.fn(),
  updateOrganizationMemberRole: vi.fn(),
  hasOrganizationPermission: vi.fn(),
  findUserById: vi.fn(),
  findOrganizationBaseRoles: vi.fn(),
  replaceOrganizationBaseRole: vi.fn(),
};

describe("OrganizationService", () => {
  let service: OrganizationService;

  const userId = "user-123";
  const targetUserId = "user-456";
  const organizationId = "org-123";
  const client = {};

  const organization: Organization = {
    id: organizationId,
    name: "AgentMacarthur",
    slug: "agentmacarthur",
    type: "team",
    ownerUserId: userId,
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

  const ownerMembership = {
    ...activeOrganizationMember,
    role: "owner" as const,
  };

  const targetMembership = {
    ...activeOrganizationMember,
    userId: targetUserId,
    role: "member" as const,
  };

  const activeTargetUser = {
    id: targetUserId,
    email: "target@example.com",
    displayName: "Target User",
    passwordHash: "test-password-hash",
    status: "active" as const,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const transferredOrganization: Organization = {
    ...organization,
    ownerUserId: targetUserId,
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (transactionClient: object) => Promise<unknown>
      ) => operation(client)
    );

    mocks.findOrganizationById.mockResolvedValue(organization);
    mocks.findOrganizationByIdForUpdate.mockResolvedValue(organization);
    mocks.findOrganizationsByUserId.mockResolvedValue([organization]);
    mocks.updateOrganization.mockResolvedValue(organization);
    mocks.updateOrganizationOwner.mockResolvedValue(
      transferredOrganization
    );

    mocks.findOrganizationMember.mockImplementation(
      async (
        _orgId: string,
        memberUserId: string
      ) => {
        if (memberUserId === userId) {
          return ownerMembership;
        }

        if (memberUserId === targetUserId) {
          return targetMembership;
        }

        return undefined;
      }
    );

    mocks.updateOrganizationMemberRole.mockImplementation(
      async (
        _orgId: string,
        memberUserId: string,
        role: "owner" | "admin" | "member"
      ) => ({
        organizationId,
        userId: memberUserId,
        role,
        status: "active",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
    );

    mocks.hasOrganizationPermission.mockResolvedValue(false);
    mocks.findUserById.mockResolvedValue(activeTargetUser);

    mocks.findOrganizationBaseRoles.mockImplementation(
      async (_orgId: string, memberUserId: string) => {
        if (memberUserId === userId) {
          return ["owner"];
        }

        if (memberUserId === targetUserId) {
          return ["member"];
        }

        return [];
      }
    );

    mocks.replaceOrganizationBaseRole.mockResolvedValue(undefined);

    const permissionService = new OrganizationPermissionService({
      hasOrganizationPermission: mocks.hasOrganizationPermission,
    } as unknown as any);

    service = new OrganizationService(
      {
        findById: mocks.findOrganizationById,
        findByIdForUpdate: mocks.findOrganizationByIdForUpdate,
        findByUserId: mocks.findOrganizationsByUserId,
        update: mocks.updateOrganization,
        updateOwner: mocks.updateOrganizationOwner,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
        updateRole: mocks.updateOrganizationMemberRole,
      } as never,
      permissionService,
      {
        findById: mocks.findUserById,
      } as never,
      {
        findOrganizationBaseRoles: mocks.findOrganizationBaseRoles,
        replaceOrganizationBaseRole: mocks.replaceOrganizationBaseRole,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("list", () => {
    it("should list organizations accessible to the user", async () => {
      const result = await service.list(userId);

      expect(result).toEqual([organization]);

      expect(mocks.findOrganizationsByUserId).toHaveBeenCalledWith(
        userId
      );
    });
  });

  describe("getById", () => {
    it("should allow active organization members to view an organization", async () => {
      mocks.findOrganizationMember.mockResolvedValue(
        activeOrganizationMember
      );

      const result = await service.getById(
        organizationId,
        userId
      );

      expect(result).toEqual(organization);

      expect(mocks.findOrganizationMember).toHaveBeenCalledWith(
        organizationId,
        userId,
        expect.any(Object)
      );
    });

    it("should allow organization owners to view an organization", async () => {
      const result = await service.getById(
        organizationId,
        userId
      );

      expect(result).toEqual(organization);
    });

    it("should deny suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        status: "suspended",
      });

      await expect(
        service.getById(organizationId, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should hide organizations from users without membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.getById(organizationId, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should hide organizations that do not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.getById(organizationId, userId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should allow users with organization.update permission", async () => {
      mocks.hasOrganizationPermission.mockResolvedValue(true);

      const result = await service.update(
        organizationId,
        userId,
        { name: "Updated Organization" }
      );

      expect(result).toEqual(organization);

      expect(mocks.hasOrganizationPermission).toHaveBeenCalledWith(
        organizationId,
        userId,
        "organization.update",
        expect.any(Object)
      );

      expect(mocks.updateOrganization).toHaveBeenCalledWith(
        organizationId,
        { name: "Updated Organization" },
        expect.any(Object)
      );
    });

    it("should allow a member with a custom role granting organization.update", async () => {
      mocks.hasOrganizationPermission.mockResolvedValue(true);

      await service.update(
        organizationId,
        userId,
        { name: "Custom Role Update" }
      );

      expect(mocks.updateOrganization).toHaveBeenCalledOnce();
    });

    it("should deny users without organization.update permission", async () => {
      await expect(
        service.update(organizationId, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.updateOrganization).not.toHaveBeenCalled();
    });

    it("should deny suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        status: "suspended",
      });

      await expect(
        service.update(organizationId, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.hasOrganizationPermission).not.toHaveBeenCalled();
      expect(mocks.updateOrganization).not.toHaveBeenCalled();
    });

    it("should hide organizations from users without membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.update(organizationId, userId, {
          name: "Unauthorized Update",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.hasOrganizationPermission).not.toHaveBeenCalled();
      expect(mocks.updateOrganization).not.toHaveBeenCalled();
    });

    it("should hide organizations that do not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.update(organizationId, userId, {
          name: "Updated Organization",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
      expect(mocks.hasOrganizationPermission).not.toHaveBeenCalled();
      expect(mocks.updateOrganization).not.toHaveBeenCalled();
    });
  });

  describe("transferOwnership", () => {
    it("should transfer ownership and synchronize both members' base and legacy roles", async () => {
      const result = await service.transferOwnership(
        organizationId,
        userId,
        targetUserId
      );

      expect(result).toEqual(transferredOrganization);

      expect(mocks.findOrganizationByIdForUpdate).toHaveBeenCalledWith(
        organizationId,
        client
      );

      expect(mocks.replaceOrganizationBaseRole).toHaveBeenNthCalledWith(
        1,
        {
          organizationId,
          userId,
          roleKey: "admin",
          assignedBy: userId,
        },
        client
      );

      expect(mocks.replaceOrganizationBaseRole).toHaveBeenNthCalledWith(
        2,
        {
          organizationId,
          userId: targetUserId,
          roleKey: "owner",
          assignedBy: userId,
        },
        client
      );

      expect(mocks.updateOrganizationMemberRole).toHaveBeenNthCalledWith(
        1,
        organizationId,
        userId,
        "admin",
        client
      );

      expect(mocks.updateOrganizationMemberRole).toHaveBeenNthCalledWith(
        2,
        organizationId,
        targetUserId,
        "owner",
        client
      );

      expect(mocks.updateOrganizationOwner).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        client
      );

      expect(mocks.hasOrganizationPermission).not.toHaveBeenCalled();
    });

    it("should reject a requester who is not the current owner", async () => {
      mocks.findOrganizationByIdForUpdate.mockResolvedValue({
        ...organization,
        ownerUserId: "another-owner",
      });

      await expect(
        service.transferOwnership(
          organizationId,
          "another-user",
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
      expect(mocks.updateOrganizationOwner).not.toHaveBeenCalled();
      expect(mocks.hasOrganizationPermission).not.toHaveBeenCalled();
    });

    it("should reject transferring ownership to the current owner", async () => {
      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          userId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should reject when the organization does not exist", async () => {
      mocks.findOrganizationByIdForUpdate.mockResolvedValue(undefined);

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
    });

    it("should reject when the current owner membership is not active", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_orgId: string, memberUserId: string) => {
          if (memberUserId === userId) {
            return { ...ownerMembership, status: "suspended" };
          }

          return targetMembership;
        }
      );

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should reject when the target membership is missing or suspended", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_orgId: string, memberUserId: string) => {
          if (memberUserId === userId) {
            return ownerMembership;
          }

          return undefined;
        }
      );

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should reject when the target user account does not exist", async () => {
      mocks.findUserById.mockResolvedValue(undefined);

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should reject when the target user account is inactive", async () => {
      mocks.findUserById.mockResolvedValue({
        ...activeTargetUser,
        status: "suspended",
      });

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should reject an inconsistent current owner legacy role", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_orgId: string, memberUserId: string) => {
          if (memberUserId === userId) {
            return { ...ownerMembership, role: "member" };
          }

          return targetMembership;
        }
      );

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it.each([
      [[]],
      [["admin"]],
      [["owner", "admin"]],
    ])(
      "should reject an invalid current owner base-role assignment: %j",
      async (roles) => {
        mocks.findOrganizationBaseRoles.mockImplementation(
          async (_orgId: string, memberUserId: string) => {
            return memberUserId === userId ? roles : ["member"];
          }
        );

        await expect(
          service.transferOwnership(
            organizationId,
            userId,
            targetUserId
          )
        ).rejects.toMatchObject({
          statusCode: 409,
        });

        expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
      }
    );

    it.each([
      [[]],
      [["owner"]],
      [["member", "admin"]],
    ])(
      "should reject an invalid target base-role assignment: %j",
      async (roles) => {
        mocks.findOrganizationBaseRoles.mockImplementation(
          async (_orgId: string, memberUserId: string) => {
            return memberUserId === userId ? ["owner"] : roles;
          }
        );

        await expect(
          service.transferOwnership(
            organizationId,
            userId,
            targetUserId
          )
        ).rejects.toMatchObject({
          statusCode: 409,
        });

        expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
      }
    );

    it("should reject an inconsistent target legacy role", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_orgId: string, memberUserId: string) => {
          if (memberUserId === userId) {
            return ownerMembership;
          }

          return { ...targetMembership, role: "admin" };
        }
      );

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("should map the personal-organization owner conflict to 409", async () => {
      const conflict = Object.assign(
        new Error("duplicate key value violates unique constraint"),
        {
          code: "23505",
          constraint: "idx_organizations_one_personal_per_owner",
        }
      );

      mocks.updateOrganizationOwner.mockRejectedValue(conflict);

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("should propagate unrelated database unique violations", async () => {
      const conflict = Object.assign(
        new Error("unrelated unique constraint"),
        {
          code: "23505",
          constraint: "some_other_constraint",
        }
      );

      mocks.updateOrganizationOwner.mockRejectedValue(conflict);

      await expect(
        service.transferOwnership(
          organizationId,
          userId,
          targetUserId
        )
      ).rejects.toBe(conflict);
    });
  });
});
