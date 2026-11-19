import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";

import type { Organization } from "../../src/organizations/organization.types.js";
import type {
  OrganizationMember,
  OrganizationMemberDetails,
  OrganizationMemberDirectoryEntry,
} from "../../src/organization-members/organization-member.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  findOrganizationById: vi.fn(),
  lockOrganization: vi.fn(),
  findOrganizationMember: vi.fn(),
  findAllBasicOrganizationMembers: vi.fn(),
  findOrganizationMemberDetails: vi.fn(),
  updateStatus: vi.fn(),
  updateRole: vi.fn(),
  assertOrganizationPermission: vi.fn(),
  findUserById: vi.fn(),
  findOrganizationBaseRoles: vi.fn(),
  replaceOrganizationBaseRole: vi.fn(),
};

describe("OrganizationMemberService", () => {
  let service: OrganizationMemberService;

  const organizationId = "org-123";
  const requesterUserId = "user-123";
  const targetUserId = "user-456";

  const transactionClient = {};

  const organization: Organization = {
    id: organizationId,
    name: "AgentMacarthur",
    slug: "agentmacarthur",
    type: "team",
    ownerUserId: requesterUserId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const activeMembership: OrganizationMember = {
    organizationId,
    userId: requesterUserId,
    role: "owner",
    status: "active",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const targetMembership: OrganizationMember = {
    organizationId,
    userId: targetUserId,
    role: "member",
    status: "active",
    joinedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  const directoryEntries: OrganizationMemberDirectoryEntry[] = [
    {
      userId: targetUserId,
      displayName: "Taylor",
    },
  ];

  const memberDetails: OrganizationMemberDetails = {
    organizationId,
    userId: targetUserId,
    email: "member@example.com",
    displayName: "Taylor",
    userStatus: "active",
    status: "active",
    roles: [
      {
        key: "developer",
        name: "Developer",
        description: "Develops application features.",
        isSystem: true,
      },
    ],
    joinedAt: new Date("2026-01-02T00:00:00.000Z"),
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
    mocks.lockOrganization.mockResolvedValue(organization);
    mocks.findOrganizationMember.mockImplementation(
      async (_organizationId: string, userId: string) => {
        return userId === requesterUserId
          ? activeMembership
          : targetMembership;
      }
    );
    mocks.findAllBasicOrganizationMembers.mockResolvedValue(
      directoryEntries
    );
    mocks.findOrganizationMemberDetails.mockResolvedValue(
      memberDetails
    );
    mocks.updateStatus.mockImplementation(
      async (
        _organizationId: string,
        userId: string,
        status: "active" | "suspended"
      ) => ({
        ...targetMembership,
        userId,
        status,
      })
    );
    mocks.updateRole.mockImplementation(
      async (
        _organizationId: string,
        userId: string,
        role: "owner" | "admin" | "member"
      ) => ({
        ...targetMembership,
        userId,
        role,
      })
    );
    mocks.assertOrganizationPermission.mockResolvedValue(undefined);
    mocks.findUserById.mockResolvedValue({
      id: targetUserId,
      status: "active",
    });
    mocks.findOrganizationBaseRoles.mockImplementation(
      async (_organizationId: string, userId: string) => {
        if (userId === requesterUserId) {
          return ["owner"];
        }

        return ["member"];
      }
    );
    mocks.replaceOrganizationBaseRole.mockResolvedValue(undefined);

    service = new OrganizationMemberService(
      {
        findById: mocks.findOrganizationById,
        findByIdForUpdate: mocks.lockOrganization,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
        findAllBasicByOrganizationId:
          mocks.findAllBasicOrganizationMembers,
        findDetailsByOrganizationAndUser:
          mocks.findOrganizationMemberDetails,
        updateStatus: mocks.updateStatus,
        updateRole: mocks.updateRole,
      } as never,
      {
        assertOrganizationPermission:
          mocks.assertOrganizationPermission,
      } as never,
      {
        findById: mocks.findUserById,
      } as never,
      {
        findOrganizationBaseRoles:
          mocks.findOrganizationBaseRoles,
        replaceOrganizationBaseRole:
          mocks.replaceOrganizationBaseRole,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("listMembers", () => {
    it("returns only basic directory entries with view permission", async () => {
      const result = await service.listMembers(
        organizationId,
        requesterUserId
      );

      expect(result).toEqual(directoryEntries);

      expect(mocks.assertOrganizationPermission).toHaveBeenCalledWith(
        organizationId,
        requesterUserId,
        "organization.members.view",
        transactionClient
      );

      expect(
        mocks.findAllBasicOrganizationMembers
      ).toHaveBeenCalledWith(organizationId, transactionClient);

      expect(
        mocks.findOrganizationMemberDetails
      ).not.toHaveBeenCalled();
    });

    it("denies members without basic directory permission", async () => {
      mocks.assertOrganizationPermission.mockRejectedValue({
        statusCode: 403,
      });

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(
        mocks.findAllBasicOrganizationMembers
      ).not.toHaveBeenCalled();
    });

    it("denies suspended requesters", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeMembership,
        status: "suspended",
      });

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(
        mocks.assertOrganizationPermission
      ).not.toHaveBeenCalled();
    });

    it("denies users without organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("hides organizations that do not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
    });
  });

  describe("getMember", () => {
    it("retrieves extended details with view_details permission", async () => {
      const result = await service.getMember(
        organizationId,
        targetUserId,
        requesterUserId
      );

      expect(result).toEqual(memberDetails);

      expect(mocks.assertOrganizationPermission).toHaveBeenCalledWith(
        organizationId,
        requesterUserId,
        "organization.members.view_details",
        transactionClient
      );

      expect(
        mocks.findOrganizationMemberDetails
      ).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        transactionClient
      );
    });

    it("denies members without extended details permission", async () => {
      mocks.assertOrganizationPermission.mockRejectedValue({
        statusCode: 403,
      });

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(
        mocks.findOrganizationMemberDetails
      ).not.toHaveBeenCalled();
    });

    it("returns 404 when the target is not a member", async () => {
      mocks.findOrganizationMemberDetails.mockResolvedValue(undefined);

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("suspendMember", () => {
    it("allows the owner to suspend an ordinary member", async () => {
      const result = await service.suspendMember(
        organizationId,
        targetUserId,
        requesterUserId
      );

      expect(result.status).toBe("suspended");

      expect(mocks.lockOrganization).toHaveBeenCalledWith(
        organizationId,
        transactionClient
      );

      expect(mocks.assertOrganizationPermission).toHaveBeenCalledWith(
        organizationId,
        requesterUserId,
        "organization.members.manage",
        transactionClient
      );

      expect(mocks.updateStatus).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        "suspended",
        transactionClient
      );
    });

    it("rejects suspending an already suspended member", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId
            ? activeMembership
            : { ...targetMembership, status: "suspended" }
      );

      await expect(
        service.suspendMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it("prevents the owner from suspending themself", async () => {
      await expect(
        service.suspendMember(
          organizationId,
          requesterUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it("prevents ordinary membership operations from suspending the owner", async () => {
      await expect(
        service.suspendMember(
          organizationId,
          requesterUserId,
          targetUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("prevents an admin from suspending another admin", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId
            ? activeMembership
            : { ...targetMembership, role: "admin" }
      );

      mocks.findOrganizationBaseRoles.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId ? ["admin"] : ["admin"]
      );

      const nonOwnerOrganization = {
        ...organization,
        ownerUserId: "different-owner",
      };

      mocks.lockOrganization.mockResolvedValue(nonOwnerOrganization);
      mocks.findOrganizationById.mockResolvedValue(nonOwnerOrganization);

      await expect(
        service.suspendMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it.each([
      { roles: [], description: "no base role" },
      { roles: ["owner"], description: "an owner base role" },
      {
        roles: ["member", "admin"],
        description: "multiple base roles",
      },
    ])(
      "rejects suspending a target with $description",
      async ({ roles }) => {
        mocks.findOrganizationBaseRoles.mockImplementation(
          async (_organizationId: string, userId: string) =>
            userId === requesterUserId ? ["owner"] : roles
        );

        await expect(
          service.suspendMember(
            organizationId,
            targetUserId,
            requesterUserId
          )
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(mocks.updateStatus).not.toHaveBeenCalled();
      }
    );
  });

  describe("reactivateMember", () => {
    it("allows the owner to reactivate a suspended member with an active user account", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId
            ? activeMembership
            : { ...targetMembership, status: "suspended" }
      );

      const result = await service.reactivateMember(
        organizationId,
        targetUserId,
        requesterUserId
      );

      expect(result.status).toBe("active");

      expect(mocks.findUserById).toHaveBeenCalledWith(
        targetUserId,
        transactionClient
      );

      expect(mocks.updateStatus).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        "active",
        transactionClient
      );
    });

    it("rejects reactivation when the target user account is not active", async () => {
      mocks.findOrganizationMember.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId
            ? activeMembership
            : { ...targetMembership, status: "suspended" }
      );

      mocks.findUserById.mockResolvedValue({
        id: targetUserId,
        status: "suspended",
      });

      await expect(
        service.reactivateMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });

    it("rejects reactivating an already active member", async () => {
      await expect(
        service.reactivateMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.findUserById).not.toHaveBeenCalled();
      expect(mocks.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe("changeMemberRole", () => {
    it("allows the owner to promote a member to admin", async () => {
      const result = await service.changeMemberRole(
        organizationId,
        targetUserId,
        "admin",
        requesterUserId
      );

      expect(result.role).toBe("admin");

      expect(
        mocks.replaceOrganizationBaseRole
      ).toHaveBeenCalledWith(
        {
          organizationId,
          userId: targetUserId,
          roleKey: "admin",
          assignedBy: requesterUserId,
        },
        transactionClient
      );

      expect(mocks.updateRole).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        "admin",
        transactionClient
      );
    });

    it("uses assigned base roles rather than the legacy membership role for no-op detection", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...targetMembership,
        role: "admin",
      });

      mocks.findOrganizationBaseRoles.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId ? ["owner"] : ["member"]
      );

      const result = await service.changeMemberRole(
        organizationId,
        targetUserId,
        "admin",
        requesterUserId
      );

      expect(result.role).toBe("admin");
      expect(mocks.replaceOrganizationBaseRole).toHaveBeenCalled();
    });

    it("rejects a role change when the assigned base role is already the requested role", async () => {
      mocks.findOrganizationBaseRoles.mockImplementation(
        async (_organizationId: string, userId: string) =>
          userId === requesterUserId ? ["owner"] : ["admin"]
      );

      await expect(
        service.changeMemberRole(
          organizationId,
          targetUserId,
          "admin",
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
      expect(mocks.updateRole).not.toHaveBeenCalled();
    });

    it("denies admins from changing base roles", async () => {
      const nonOwnerOrganization = {
        ...organization,
        ownerUserId: "different-owner",
      };

      mocks.lockOrganization.mockResolvedValue(nonOwnerOrganization);
      mocks.findOrganizationById.mockResolvedValue(nonOwnerOrganization);
      mocks.findOrganizationBaseRoles.mockResolvedValue(["admin"]);

      await expect(
        service.changeMemberRole(
          organizationId,
          targetUserId,
          "admin",
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("prevents the owner from changing their own base role", async () => {
      await expect(
        service.changeMemberRole(
          organizationId,
          requesterUserId,
          "member",
          requesterUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it("prevents changing the designated owner's base role", async () => {
      await expect(
        service.changeMemberRole(
          organizationId,
          requesterUserId,
          "member",
          targetUserId
        )
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
    });

    it.each([
      { roles: [], description: "no base role" },
      { roles: ["owner"], description: "an owner base role" },
      {
        roles: ["member", "admin"],
        description: "multiple base roles",
      },
    ])(
      "rejects changing a target with $description",
      async ({ roles }) => {
        mocks.findOrganizationBaseRoles.mockImplementation(
          async (_organizationId: string, userId: string) =>
            userId === requesterUserId ? ["owner"] : roles
        );

        await expect(
          service.changeMemberRole(
            organizationId,
            targetUserId,
            "admin",
            requesterUserId
          )
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(mocks.replaceOrganizationBaseRole).not.toHaveBeenCalled();
        expect(mocks.updateRole).not.toHaveBeenCalled();
      }
    );
  });
});
