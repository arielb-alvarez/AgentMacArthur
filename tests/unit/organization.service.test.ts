import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationService } from "../../src/organizations/organization.service.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

import type { Organization } from "../../src/organizations/organization.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  findOrganizationById: vi.fn(),
  findOrganizationsByUserId: vi.fn(),
  updateOrganization: vi.fn(),
  findOrganizationMember: vi.fn(),
  hasOrganizationPermission: vi.fn(),
};

describe("OrganizationService", () => {
  let service: OrganizationService;

  const userId = "user-123";
  const organizationId = "org-123";

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

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    mocks.findOrganizationById.mockResolvedValue(organization);
    mocks.findOrganizationsByUserId.mockResolvedValue([organization]);
    mocks.updateOrganization.mockResolvedValue(organization);
    mocks.findOrganizationMember.mockResolvedValue(
      activeOrganizationMember
    );
    mocks.hasOrganizationPermission.mockResolvedValue(false);

    const permissionService = new OrganizationPermissionService({
      hasOrganizationPermission: mocks.hasOrganizationPermission,
    });

    service = new OrganizationService(
      {
        findById: mocks.findOrganizationById,
        findByUserId: mocks.findOrganizationsByUserId,
        update: mocks.updateOrganization,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
      } as never,
      permissionService,
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
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeOrganizationMember,
        role: "owner",
      });

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
});
