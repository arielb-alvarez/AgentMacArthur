import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";

import type { Organization } from "../../src/organizations/organization.types.js";
import type { OrganizationMemberDetails } from "../../src/organization-members/organization-member.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  findOrganizationById: vi.fn(),
  findOrganizationMember: vi.fn(),
  findAllOrganizationMembers: vi.fn(),
  findOrganizationMemberDetails: vi.fn(),
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

  const activeMembership = {
    organizationId,
    userId: requesterUserId,
    role: "member" as const,
    status: "active" as const,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

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
    mocks.findOrganizationMember.mockResolvedValue(activeMembership);
    mocks.findAllOrganizationMembers.mockResolvedValue([
      memberDetails,
    ]);
    mocks.findOrganizationMemberDetails.mockResolvedValue(
      memberDetails
    );

    service = new OrganizationMemberService(
      {
        findById: mocks.findOrganizationById,
      } as never,
      {
        findByOrganizationAndUser: mocks.findOrganizationMember,
        findAllByOrganizationId: mocks.findAllOrganizationMembers,
        findDetailsByOrganizationAndUser:
          mocks.findOrganizationMemberDetails,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("listMembers", () => {
    it("should list organization members for an active member", async () => {
      const result = await service.listMembers(
        organizationId,
        requesterUserId
      );

      expect(result).toEqual([memberDetails]);

      expect(mocks.findOrganizationById).toHaveBeenCalledWith(
        organizationId,
        transactionClient
      );

      expect(mocks.findOrganizationMember).toHaveBeenCalledWith(
        organizationId,
        requesterUserId,
        transactionClient
      );

      expect(mocks.findAllOrganizationMembers).toHaveBeenCalledWith(
        organizationId,
        transactionClient
      );
    });

    it("should deny suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeMembership,
        status: "suspended",
      });

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findAllOrganizationMembers).not.toHaveBeenCalled();
    });

    it("should deny users without organization membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findAllOrganizationMembers).not.toHaveBeenCalled();
    });

    it("should hide organizations that do not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.listMembers(organizationId, requesterUserId)
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
      expect(mocks.findAllOrganizationMembers).not.toHaveBeenCalled();
    });
  });

  describe("getMember", () => {
    it("should retrieve member details for an active organization member", async () => {
      const result = await service.getMember(
        organizationId,
        targetUserId,
        requesterUserId
      );

      expect(result).toEqual(memberDetails);

      expect(
        mocks.findOrganizationMemberDetails
      ).toHaveBeenCalledWith(
        organizationId,
        targetUserId,
        transactionClient
      );
    });

    it("should deny suspended organization members", async () => {
      mocks.findOrganizationMember.mockResolvedValue({
        ...activeMembership,
        status: "suspended",
      });

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(
        mocks.findOrganizationMemberDetails
      ).not.toHaveBeenCalled();
    });

    it("should hide organizations from users without membership", async () => {
      mocks.findOrganizationMember.mockResolvedValue(undefined);

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(
        mocks.findOrganizationMemberDetails
      ).not.toHaveBeenCalled();
    });

    it("should hide organizations that do not exist", async () => {
      mocks.findOrganizationById.mockResolvedValue(undefined);

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.findOrganizationMember).not.toHaveBeenCalled();
      expect(
        mocks.findOrganizationMemberDetails
      ).not.toHaveBeenCalled();
    });

    it("should return 404 when the target user is not an organization member", async () => {
      mocks.findOrganizationMemberDetails.mockResolvedValue(undefined);

      await expect(
        service.getMember(
          organizationId,
          targetUserId,
          requesterUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
