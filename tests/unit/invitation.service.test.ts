import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitationService } from "../../src/invitations/invitation.service.js";

import type { Invitation } from "../../src/invitations/invitation.types.js";
import type { Organization } from "../../src/organizations/organization.types.js";
import type { User } from "../../src/users/user.types.js";

const mocks = {
  runInTransaction: vi.fn(),
  assertPermission: vi.fn(),
  findOrganization: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  findMembership: vi.fn(),
  expirePending: vi.fn(),
  createInvitation: vi.fn(),
  recordDelivery: vi.fn(),
  findInvitation: vi.fn(),
  generateToken: vi.fn(),
  hashToken: vi.fn(),
  sendInvitationEmail: vi.fn(),
  findAllInvitations: vi.fn(),
  findInvitationById: vi.fn(),
  replaceToken: vi.fn(),
  revokeInvitation: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  createMembership: vi.fn(),
  assignOrganizationRole: vi.fn(),
  markAccepted: vi.fn(),
  lockOrganizationEmail: vi.fn(),
  findInvitationByTokenHashForUpdate: vi.fn(),
};

describe("InvitationService", () => {
  let service: InvitationService;

  const organizationId = "org-123";
  const actorUserId = "user-123";
  const transactionClient = {};

  const fixedDate = new Date("2026-11-16T02:00:00.000Z");

  const organization: Organization = {
    id: organizationId,
    name: "AgentMacarthur",
    slug: "agentmacarthur",
    type: "team",
    ownerUserId: actorUserId,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };

  const inviter: User = {
    id: actorUserId,
    email: "owner@example.com",
    displayName: "Organization Owner",
    status: "active",
    emailVerifiedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };

  const invitation: Invitation = {
    id: "invitation-123",
    organizationId,
    projectId: null,
    email: "member@example.com",
    roleId: "role-member",
    roleKey: "member",
    roleName: "Member",
    invitedBy: actorUserId,
    acceptedBy: null,
    status: "pending",
    expiresAt: new Date("2026-11-23T02:00:00.000Z"),
    acceptedAt: null,
    createdAt: fixedDate,
    emailDeliveryStatus: "pending",
    emailDeliveryAttempts: 1,
    emailLastAttemptAt: fixedDate,
    emailSentAt: null,
    emailDeliveryAttemptId: "delivery-attempt-123",
    emailDeliveryStartedAt: fixedDate,
  };

  const invitee: User = {
    id: "invitee-123",
    email: "member@example.com",
    displayName: "Invited Member",
    status: "active",
    emailVerifiedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation(transactionClient)
    );

    mocks.assertPermission.mockResolvedValue(undefined);
    mocks.findOrganization.mockResolvedValue(organization);
    mocks.findUserById.mockResolvedValue(inviter);
    mocks.findUserByEmail.mockResolvedValue(undefined);
    mocks.findMembership.mockResolvedValue(undefined);
    mocks.expirePending.mockResolvedValue(0);
    mocks.createInvitation.mockResolvedValue(invitation);
    mocks.recordDelivery.mockResolvedValue(true);
    mocks.findInvitation.mockResolvedValue({
      ...invitation,
      emailDeliveryStatus: "sent",
      emailDeliveryAttempts: 1,
      emailSentAt: fixedDate,
    });
    mocks.findAllInvitations.mockResolvedValue([invitation]);
    mocks.findInvitationById.mockImplementation(() => mocks.findInvitation());
    mocks.replaceToken.mockResolvedValue(invitation);
    mocks.revokeInvitation.mockResolvedValue({
      ...invitation,
      status: "revoked",
    });

    mocks.generateToken.mockReturnValue({
      rawToken: "raw-invitation-token",
      tokenHash: "hashed-invitation-token",
    });

    mocks.sendInvitationEmail.mockResolvedValue(undefined);

    mocks.hashToken.mockReturnValue("hashed-invitation-token");

    mocks.findInvitationByTokenHash.mockResolvedValue(invitation);
    mocks.createMembership.mockResolvedValue(undefined);
    mocks.assignOrganizationRole.mockResolvedValue(undefined);
    mocks.markAccepted.mockResolvedValue({
      ...invitation,
      status: "accepted",
      acceptedBy: invitee.id,
      acceptedAt: fixedDate,
    });
    mocks.lockOrganizationEmail.mockResolvedValue(undefined);
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation);
    mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(invitation);

    service = new InvitationService(
      {
        expirePendingByOrganizationAndEmail: mocks.expirePending,
        create: mocks.createInvitation,
        findAllByOrganizationId: mocks.findAllInvitations,
        findByIdForOrganization: mocks.findInvitationById,
        replaceToken: mocks.replaceToken,
        recordEmailDelivery: mocks.recordDelivery,
        revoke: mocks.revokeInvitation,
        lockOrganizationEmail: mocks.lockOrganizationEmail,
        findByTokenHash: mocks.findInvitationByTokenHash,
        findByTokenHashForUpdate: mocks.findInvitationByTokenHashForUpdate,
        markAccepted: mocks.markAccepted,
      } as never,
      {
        findById: mocks.findOrganization,
      } as never,
      {
        findByOrganizationAndUser: mocks.findMembership,
        create: mocks.createMembership,
      } as never,
      {
        findById: mocks.findUserById,
        findByEmail: mocks.findUserByEmail,
      } as never,
      {
        assignOrganizationRole: mocks.assignOrganizationRole,
      } as never,
      {
        assertPermission: mocks.assertPermission,
      } as never,
      {
        generate: mocks.generateToken,
        hash: mocks.hashToken,
      } as never,
      {
        sendInvitationEmail: mocks.sendInvitationEmail,
        sendVerificationEmail: vi.fn(),
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never,
      "http://localhost:4200",
      () => fixedDate
    );
  });

  describe("createInvitation", () => {
    it("should create an organization invitation with the default member role", async () => {
      const result = await service.createInvitation({
        organizationId,
        actorUserId,
        email: "  Member@Example.com  ",
      });

      expect(result.email).toBe("member@example.com");

      expect(mocks.assertPermission).toHaveBeenCalledWith(
        organizationId,
        actorUserId,
        "organization.members.manage",
        transactionClient
      );

      expect(mocks.expirePending).toHaveBeenCalledWith(
        organizationId,
        "member@example.com",
        transactionClient
      );

      expect(mocks.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          email: "member@example.com",
          roleKey: "member",
          tokenHash: "hashed-invitation-token",
          invitedBy: actorUserId,
          emailDeliveryAttemptId: expect.any(String),
          emailDeliveryStartedAt: expect.any(Date),
        }),
        transactionClient
      );

      expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "member@example.com",
          organizationName: organization.name,
          inviterDisplayName: inviter.displayName,
          roleName: "Member",
          invitationUrl:
            "http://localhost:4200/accept-invitation#token=raw-invitation-token",
        })
      );

      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "sent",
        sentAt: fixedDate,
      });
    });

    it("should support the admin invitation role", async () => {
      await service.createInvitation({
        organizationId,
        actorUserId,
        email: "admin@example.com",
        roleKey: "admin",
      });

      expect(mocks.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          roleKey: "admin",
        }),
        transactionClient
      );
    });

    it("should reject an invalid email address", async () => {
      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "invalid-email",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.runInTransaction).not.toHaveBeenCalled();
    });

    it("should reject an empty email address", async () => {
      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "   ",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.runInTransaction).not.toHaveBeenCalled();
    });

    it("should reject unsupported invitation roles", async () => {
      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
          roleKey: "owner" as never,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.runInTransaction).not.toHaveBeenCalled();
    });

    it("should reject an organization that does not exist", async () => {
      mocks.findOrganization.mockResolvedValue(undefined);

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.createInvitation).not.toHaveBeenCalled();
    });

    it("should reject an inactive inviting account", async () => {
      mocks.findUserById.mockResolvedValue({
        ...inviter,
        status: "suspended",
      });

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.createInvitation).not.toHaveBeenCalled();
    });

    it("should reject an email belonging to an existing organization member", async () => {
      mocks.findUserByEmail.mockResolvedValue({
        ...inviter,
        id: "existing-user",
        email: "member@example.com",
      });

      mocks.findMembership.mockResolvedValue({
        organizationId,
        userId: "existing-user",
        role: "member",
        status: "active",
      });

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.createInvitation).not.toHaveBeenCalled();
    });

    it("should retain the invitation if email delivery fails", async () => {
      mocks.sendInvitationEmail.mockRejectedValue(
        new Error("Email provider unavailable")
      );

      mocks.findInvitation.mockResolvedValue({
        ...invitation,
        emailDeliveryStatus: "unknown",
        emailDeliveryAttempts: 1,
      });

      const result = await service.createInvitation({
        organizationId,
        actorUserId,
        email: "member@example.com",
      });

      expect(result.status).toBe("pending");
      expect(result.emailDeliveryStatus).toBe("unknown");

      expect(mocks.createInvitation).toHaveBeenCalled();

      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "unknown",
        sentAt: null,
      });
    });


    it("should preserve a newer delivery attempt when the original attempt is superseded", async () => {
      const newerAttemptId = "newer-delivery-attempt-456";

      mocks.recordDelivery.mockResolvedValue(false);

      mocks.findInvitation.mockResolvedValue({
        ...invitation,
        emailDeliveryStatus: "pending",
        emailDeliveryAttempts: 2,
        emailDeliveryAttemptId: newerAttemptId,
        emailDeliveryStartedAt: new Date(
          "2026-11-16T02:05:00.000Z"
        ),
        emailSentAt: null,
      });

      const result = await service.createInvitation({
        organizationId,
        actorUserId,
        email: "member@example.com",
      });

      expect(mocks.sendInvitationEmail).toHaveBeenCalled();

      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "sent",
        sentAt: fixedDate,
      });

      expect(result.emailDeliveryStatus).toBe("pending");
      expect(result.emailDeliveryAttempts).toBe(2);
      expect(result.emailDeliveryAttemptId).toBe(newerAttemptId);
    });

    it("should not send email if creating the invitation and claiming its delivery attempt fails", async () => {
      mocks.createInvitation.mockRejectedValue(
        new Error("Database unavailable")
      );

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toThrow("Database unavailable");

      expect(mocks.createInvitation).toHaveBeenCalled();
      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
      expect(mocks.recordDelivery).not.toHaveBeenCalled();
    });

    it("should not mark email as failed if recording successful delivery fails", async () => {
      mocks.recordDelivery.mockRejectedValue(
        new Error("Database unavailable")
      );

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toThrow("Database unavailable");

      expect(mocks.sendInvitationEmail).toHaveBeenCalled();

      expect(mocks.recordDelivery).toHaveBeenCalledTimes(1);
      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "sent",
        sentAt: fixedDate,
      });
    });

    it("should propagate an error if recording an unknown delivery outcome fails", async () => {
      mocks.sendInvitationEmail.mockRejectedValue(
        new Error("Provider connection lost")
      );

      mocks.recordDelivery.mockRejectedValue(
        new Error("Database unavailable")
      );

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toThrow("Database unavailable");

      expect(mocks.sendInvitationEmail).toHaveBeenCalled();

      expect(mocks.recordDelivery).toHaveBeenCalledTimes(1);
      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "unknown",
        sentAt: null,
      });
    });


    it("should not expose the raw invitation token in the returned invitation", async () => {
      const result = await service.createInvitation({
        organizationId,
        actorUserId,
        email: "member@example.com",
      });

      expect(result).not.toHaveProperty("rawToken");
      expect(result).not.toHaveProperty("tokenHash");
    });

    it("should return 409 when a pending organization invitation already exists", async () => {
      mocks.createInvitation.mockRejectedValueOnce({
        code: "23505",
        constraint: "idx_invitations_pending_organization_email"
      });

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "A pending invitation already exists for this email address.",
      });

      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it("should preserve unrelated database constraint errors", async () => {
      const databaseError = {
        code: "23505",
        constraint: "some_other_unique_constraint",
      };

      mocks.createInvitation.mockRejectedValueOnce(databaseError);

      await expect(
        service.createInvitation({
          organizationId,
          actorUserId,
          email: "member@example.com",
        })
      ).rejects.toBe(databaseError);

      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });
  });

  describe("listInvitations", () => {
    it("should list organization invitations", async () => {
      const result = await service.listInvitations(
        organizationId,
        actorUserId
      );

      expect(result).toEqual([invitation]);

      expect(mocks.assertPermission).toHaveBeenCalledWith(
        organizationId,
        actorUserId,
        "organization.members.manage",
        transactionClient
      );

      expect(mocks.findAllInvitations).toHaveBeenCalledWith(
        organizationId,
        transactionClient
      );
    });

    it("should reject users without invitation management permission", async () => {
      mocks.assertPermission.mockRejectedValue(
        new Error("Forbidden")
      );

      await expect(
        service.listInvitations(organizationId, actorUserId)
      ).rejects.toThrow("Forbidden");

      expect(mocks.findAllInvitations).not.toHaveBeenCalled();
    });
  });

  describe("resendInvitation", () => {
    it("should rotate the token and resend a pending invitation", async () => {
      const result = await service.resendInvitation(
        organizationId,
        invitation.id,
        actorUserId
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: invitation.id,
          emailDeliveryStatus: "sent",
        })
      );

      expect(mocks.replaceToken).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          invitationId: invitation.id,
          tokenHash: "hashed-invitation-token",
          emailDeliveryAttemptId: expect.any(String),
          emailDeliveryStartedAt: expect.any(Date),
          staleAttemptBefore: expect.any(Date),
        }),
        transactionClient
      );

      expect(mocks.sendInvitationEmail).toHaveBeenCalled();

      expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: invitation.email,
          invitationUrl:
            "http://localhost:4200/accept-invitation#token=raw-invitation-token",
        })
      );

      expect(mocks.recordDelivery).toHaveBeenCalledWith({
        invitationId: invitation.id,
        emailDeliveryAttemptId: expect.any(String),
        status: "sent",
        sentAt: fixedDate,
      });
    });

    it("should reject invitations that do not exist", async () => {
      mocks.findInvitationById.mockResolvedValue(undefined);

      await expect(
        service.resendInvitation(
          organizationId,
          invitation.id,
          actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.replaceToken).not.toHaveBeenCalled();
    });


    it("should reject an invitation that disappears before the locked re-read", async () => {
      mocks.findUserById.mockResolvedValue(invitee);
      mocks.findInvitationByTokenHash.mockResolvedValue(invitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(undefined);

      await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.lockOrganizationEmail).toHaveBeenCalledWith(
        organizationId,
        invitation.email,
        transactionClient
      );

      expect(mocks.findInvitationByTokenHashForUpdate).toHaveBeenCalledWith(
        "hashed-invitation-token",
        transactionClient
      );

      expect(mocks.findMembership).not.toHaveBeenCalled();
      expect(mocks.createMembership).not.toHaveBeenCalled();
      expect(mocks.assignOrganizationRole).not.toHaveBeenCalled();
      expect(mocks.markAccepted).not.toHaveBeenCalled();
    });

    it("should re-read the invitation after acquiring the organization email lock", async () => {
      mocks.findUserById.mockResolvedValue(invitee);

      const operations: string[] = [];

      mocks.findInvitationByTokenHash.mockImplementation(async () => {
        operations.push("initial-lookup");
        return invitation;
      });

      mocks.lockOrganizationEmail.mockImplementation(async () => {
        operations.push("email-lock");
      });

      mocks.findInvitationByTokenHashForUpdate.mockImplementation(async () => {
        operations.push("locked-lookup");
        return invitation;
      });

      mocks.findMembership.mockImplementation(async () => {
        operations.push("membership-check");
        return undefined;
      });

      mocks.createMembership.mockImplementation(async () => {
        operations.push("create-membership");
      });

      mocks.assignOrganizationRole.mockImplementation(async () => {
        operations.push("assign-role");
      });

      mocks.markAccepted.mockImplementation(async () => {
        operations.push("mark-accepted");
        return {
          ...invitation,
          status: "accepted",
          acceptedBy: invitee.id,
          acceptedAt: fixedDate,
        };
      });

      await service.acceptInvitation(invitee.id, "raw-invitation-token");

      expect(operations).toEqual([
        "initial-lookup",
        "email-lock",
        "locked-lookup",
        "membership-check",
        "create-membership",
        "assign-role",
        "mark-accepted",
      ]);
    });

    it("should reject a project invitation returned by the locked re-read", async () => {
      mocks.findUserById.mockResolvedValue(invitee);
      mocks.findInvitationByTokenHash.mockResolvedValue(invitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue({
        ...invitation,
        projectId: "project-123",
      });

      await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
      ).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(mocks.findInvitationByTokenHashForUpdate).toHaveBeenCalled();
      expect(mocks.findMembership).not.toHaveBeenCalled();
      expect(mocks.createMembership).not.toHaveBeenCalled();
      expect(mocks.assignOrganizationRole).not.toHaveBeenCalled();
    });

    it("should reject invitations that are no longer pending", async () => {
      mocks.findInvitationById.mockResolvedValue({
        ...invitation,
        status: "revoked",
      });
      const revokedInvitation = {
        ...invitation,
        status: "revoked",
      };

      mocks.findInvitationByTokenHash.mockResolvedValue(revokedInvitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(revokedInvitation);

      await expect(
        service.resendInvitation(
          organizationId,
          invitation.id,
          actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceToken).not.toHaveBeenCalled();
    });

    it("should reject expired invitations", async () => {
      mocks.findInvitationById.mockResolvedValue({
        ...invitation,
        expiresAt: new Date("2026-11-15T00:00:00.000Z"),
      });
      const expiredInvitation = {
        ...invitation,
        expiresAt: new Date("2026-11-15T00:00:00.000Z"),
      };

      mocks.findInvitationByTokenHash.mockResolvedValue(expiredInvitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(expiredInvitation);

      await expect(
        service.resendInvitation(
          organizationId,
          invitation.id,
          actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 410,
      });

      expect(mocks.replaceToken).not.toHaveBeenCalled();
    });

    it("should reject a resend when another delivery attempt is active", async () => {
      mocks.replaceToken.mockResolvedValue(undefined);

      await expect(
        service.resendInvitation(
        organizationId,
        invitation.id,
        actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.replaceToken).toHaveBeenCalled();
      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });
  });

  describe("revokeInvitation", () => {
    it("should revoke a pending invitation", async () => {
      const result = await service.revokeInvitation(
        organizationId,
        invitation.id,
        actorUserId
      );

      expect(result.status).toBe("revoked");

      expect(mocks.revokeInvitation).toHaveBeenCalledWith(
        organizationId,
        invitation.id,
        transactionClient
      );
    });

    it("should reject invitations that do not exist", async () => {
      mocks.findInvitationById.mockResolvedValue(undefined);

      await expect(
        service.revokeInvitation(
          organizationId,
          invitation.id,
          actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    });

    it("should reject invitations that are no longer pending", async () => {
      mocks.findInvitationById.mockResolvedValue({
        ...invitation,
        status: "accepted",
      });

      await expect(
        service.revokeInvitation(
          organizationId,
          invitation.id,
          actorUserId
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    });
  });


  describe("acceptInvitation", () => {
    it("should accept an invitation and assign the canonical organization role", async () => {
        mocks.findUserById.mockResolvedValue(invitee);

        const result = await service.acceptInvitation(
        invitee.id,
        "raw-invitation-token"
        );

        expect(result.status).toBe("accepted");
        expect(result.acceptedBy).toBe(invitee.id);

        expect(mocks.hashToken).toHaveBeenCalledWith(
        "raw-invitation-token"
        );

        expect(mocks.findInvitationByTokenHash).toHaveBeenCalledWith(
        "hashed-invitation-token",
        transactionClient
        );

        expect(mocks.findMembership).toHaveBeenCalledWith(
        organizationId,
        invitee.id,
        transactionClient
        );

        expect(mocks.createMembership).toHaveBeenCalledWith(
        {
            organizationId,
            userId: invitee.id,
            role: "member",
            status: "active",
        },
        transactionClient
        );

        expect(mocks.assignOrganizationRole).toHaveBeenCalledWith(
        {
            organizationId,
            userId: invitee.id,
            roleKey: "member",
            assignedBy: actorUserId,
        },
        transactionClient
        );

        expect(mocks.markAccepted).toHaveBeenCalledWith(
        invitation.id,
        invitee.id,
        transactionClient
        );
    });

    it("should reject an empty invitation token", async () => {
        await expect(
        service.acceptInvitation(invitee.id, "   ")
        ).rejects.toMatchObject({
        statusCode: 400,
        });

        expect(mocks.runInTransaction).not.toHaveBeenCalled();
    });

    it("should reject inactive accounts", async () => {
        mocks.findUserById.mockResolvedValue({
        ...invitee,
        status: "suspended",
        });

        await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
        ).rejects.toMatchObject({
        statusCode: 403,
        });

        expect(mocks.findInvitationByTokenHash).not.toHaveBeenCalled();
    });

    it("should reject accounts without verified email addresses", async () => {
        mocks.findUserById.mockResolvedValue({
        ...invitee,
        emailVerifiedAt: null,
        });

        await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
        ).rejects.toMatchObject({
        statusCode: 403,
        });

        expect(mocks.findInvitationByTokenHash).not.toHaveBeenCalled();
    });

    it("should reject an invitation with an invalid token", async () => {
        mocks.findUserById.mockResolvedValue(invitee);
        mocks.findInvitationByTokenHash.mockResolvedValue(undefined);

        await expect(
        service.acceptInvitation(invitee.id, "invalid-token")
        ).rejects.toMatchObject({
        statusCode: 400,
        });

        expect(mocks.createMembership).not.toHaveBeenCalled();
    });

    it("should reject invitations that are no longer pending", async () => {
      mocks.findUserById.mockResolvedValue(invitee);

      const revokedInvitation = {
        ...invitation,
        status: "revoked",
      };

      mocks.findInvitationByTokenHash.mockResolvedValue(revokedInvitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(revokedInvitation);

      await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      expect(mocks.createMembership).not.toHaveBeenCalled();
    });

    it("should reject expired invitations", async () => {
      mocks.findUserById.mockResolvedValue(invitee);

      const expiredInvitation = {
        ...invitation,
        expiresAt: new Date("2026-11-15T00:00:00.000Z"),
      };

      mocks.findInvitationByTokenHash.mockResolvedValue(expiredInvitation);
      mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(expiredInvitation);

      await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
      ).rejects.toMatchObject({
        statusCode: 410,
      });

      expect(mocks.createMembership).not.toHaveBeenCalled();
    });

    it("should reject invitations sent to a different email address", async () => {
        mocks.findUserById.mockResolvedValue({
        ...invitee,
        email: "different@example.com",
        });

        await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
        ).rejects.toMatchObject({
        statusCode: 403,
        });

        expect(mocks.createMembership).not.toHaveBeenCalled();
    });

    it("should reject users who are already organization members", async () => {
        mocks.findUserById.mockResolvedValue(invitee);
        mocks.findMembership.mockResolvedValue({
        organizationId,
        userId: invitee.id,
        role: "member",
        status: "active",
        });

        await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
        ).rejects.toMatchObject({
        statusCode: 409,
        });

        expect(mocks.createMembership).not.toHaveBeenCalled();
        expect(mocks.assignOrganizationRole).not.toHaveBeenCalled();
    });

    it("should not complete acceptance if marking the invitation fails", async () => {
        mocks.findUserById.mockResolvedValue(invitee);
        mocks.markAccepted.mockResolvedValue(undefined);

        await expect(
        service.acceptInvitation(invitee.id, "raw-invitation-token")
        ).rejects.toMatchObject({
        statusCode: 409,
        });

        expect(mocks.createMembership).toHaveBeenCalled();
        expect(mocks.assignOrganizationRole).toHaveBeenCalled();
    });

    it("should support admin invitations", async () => {
        mocks.findUserById.mockResolvedValue(invitee);
        mocks.findInvitationByTokenHash.mockResolvedValue({
        ...invitation,
        roleKey: "admin",
        });
        const adminInvitation = {
          ...invitation,
          roleKey: "admin",
        };

        mocks.findInvitationByTokenHash.mockResolvedValue(adminInvitation);
        mocks.findInvitationByTokenHashForUpdate.mockResolvedValue(adminInvitation);

        await service.acceptInvitation(
          invitee.id,
          "raw-invitation-token"
        );

        expect(mocks.createMembership).toHaveBeenCalledWith(
        expect.objectContaining({
            role: "admin",
        }),
        transactionClient
        );

        expect(mocks.assignOrganizationRole).toHaveBeenCalledWith(
        expect.objectContaining({
            roleKey: "admin",
        }),
        transactionClient
        );
    });
  });
});
