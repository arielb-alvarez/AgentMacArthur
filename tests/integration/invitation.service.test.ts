import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { RoleAssignmentRepository } from "../../src/role-assignments/role-assignment.repository.js";

import { testPool } from "../../src/config/test-database.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { TokenService } from "../../src/auth/token.service.js";
import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";
import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";
import { PostgresInvitationRepository } from "../../src/invitations/postgres-invitation.repository.js";

import { InvitationService } from "../../src/invitations/invitation.service.js";

describe("InvitationService integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

  const tokenService = new TokenService();

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const organizationRepository = new PostgresOrganizationRepository(
    testPool,
    transactionManager
  );

  const organizationMemberRepository =
    new PostgresOrganizationMemberRepository(
      testPool,
      transactionManager
    );

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const permissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const permissionService = new OrganizationPermissionService(
    permissionRepository
  );

  const invitationRepository = new PostgresInvitationRepository(
    testPool,
    transactionManager
  );

  const emailService = {
    sendVerificationEmail: async () => { },
    sendInvitationEmail: async () => { },
  };

  const createService = (
    roleRepository: RoleAssignmentRepository = roleAssignmentRepository
  ) =>
    new InvitationService(
      invitationRepository,
      organizationRepository,
      organizationMemberRepository,
      userRepository,
      roleRepository,
      permissionService,
      tokenService,
      emailService,
      transactionManager,
      "http://localhost:4200"
    );

  const createSynchronizedAcceptanceService = (
    expectedLookups: number
  ) => {
    let lookupCount = 0;
    let releaseLookups: (() => void) | undefined;

    const bothLookupsReached = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });

    const synchronizedInvitationRepository = new Proxy(
      invitationRepository,
      {
        get(target, property) {
          if (property === "findByTokenHash") {
            return async (
              tokenHash: string,
              client?: import("pg").PoolClient
            ) => {
              const invitation =
                await target.findByTokenHash(tokenHash, client as unknown as import("pg").PoolClient);

              lookupCount += 1;

              if (lookupCount === expectedLookups) {
                releaseLookups?.();
              }

              await bothLookupsReached;

              return invitation;
            };
          }

          const value = Reflect.get(target, property, target);

          return typeof value === "function"
            ? value.bind(target)
            : value;
        },
      }
    );

    return new InvitationService(
      synchronizedInvitationRepository,
      organizationRepository,
      organizationMemberRepository,
      userRepository,
      roleAssignmentRepository,
      permissionService,
      tokenService,
      emailService,
      transactionManager,
      "http://localhost:4200"
    );
  };

  const createUser = async (
    email: string,
    displayName = "Test User"
  ) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName,
    });
  };

  const verifyUser = async (userId: string) => {
    const verified = await userRepository.verifyEmail(userId);

    if (!verified) {
      throw new Error("Test user could not be verified.");
    }

    return verified;
  };

  const createOrganization = async (
    ownerUserId: string,
    slug: string
  ) => {
    return transactionManager.runInTransaction(
      "createInvitationServiceTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: `${slug} Workspace`,
            slug,
            type: "team",
            ownerUserId,
          },
          client
        );

        await organizationMemberRepository.create(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            role: "owner",
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            roleKey: "owner",
            assignedBy: ownerUserId,
          },
          client
        );

        return organization;
      }
    );
  };

  const createInvitation = async (
    organizationId: string,
    invitedBy: string,
    email: string,
    roleKey: "admin" | "member" = "member"
  ) => {
    const generatedToken = tokenService.generate();
    const now = new Date();

    const invitation = await invitationRepository.create({
      organizationId,
      email,
      roleKey,
      tokenHash: generatedToken.tokenHash,
      invitedBy,
      expiresAt: new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      ),
      emailDeliveryAttemptId: randomUUID(),
      emailDeliveryStartedAt: now,
    });

    return {
      invitation,
      rawToken: generatedToken.rawToken,
    };
  };

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  describe("acceptInvitation", () => {
    it("should accept an invitation and persist membership and canonical role", async () => {
      const owner = await createUser("owner@example.com");
      const invitee = await createUser("invitee@example.com");

      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-success"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      const service = createService();

      const accepted = await service.acceptInvitation(
        invitee.id,
        rawToken
      );

      expect(accepted).toMatchObject({
        id: invitation.id,
        organizationId: organization.id,
        email: invitee.email,
        status: "accepted",
        acceptedBy: invitee.id,
      });

      expect(accepted.acceptedAt).toBeInstanceOf(Date);

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toMatchObject({
        organizationId: organization.id,
        userId: invitee.id,
        role: "member",
        status: "active",
      });

      const assignedRoles = await testPool.query(
        `SELECT r.key
         FROM organization_member_roles omr
         INNER JOIN roles r
           ON r.id = omr.role_id
         WHERE omr.organization_id = $1
           AND omr.user_id = $2`,
        [organization.id, invitee.id]
      );

      expect(assignedRoles.rows).toEqual([
        { key: "member" },
      ]);

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        status: "accepted",
        acceptedBy: invitee.id,
      });
    });

    it("should roll back membership and invitation acceptance when role assignment fails", async () => {
      const owner = await createUser("owner@example.com");
      const invitee = await createUser("rollback-invitee@example.com");

      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-rollback"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      const failingRoleAssignmentRepository: RoleAssignmentRepository = {
        assignOrganizationRole: async () => {
          throw new Error("Simulated role assignment failure.");
        },

        assignProjectRole: (
          input,
          client
        ) =>
          roleAssignmentRepository.assignProjectRole(
            input,
            client
          ),
      };

      const service = createService(
        failingRoleAssignmentRepository
      );

      await expect(
        service.acceptInvitation(invitee.id, rawToken)
      ).rejects.toThrow("Simulated role assignment failure.");

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toBeUndefined();

      const assignedRoles = await testPool.query(
        `SELECT 1
        FROM organization_member_roles
        WHERE organization_id = $1
            AND user_id = $2`,
        [organization.id, invitee.id]
      );

      expect(assignedRoles.rows).toHaveLength(0);

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        id: invitation.id,
        status: "pending",
        acceptedBy: null,
        acceptedAt: null,
      });
    });

    it("should allow only one concurrent acceptance of the same invitation", async () => {
      const owner = await createUser("concurrent-owner@example.com");
      const invitee = await createUser("concurrent-invitee@example.com");

      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-concurrent"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      const service = createSynchronizedAcceptanceService(2);

      const results = await Promise.allSettled([
        service.acceptInvitation(invitee.id, rawToken),
        service.acceptInvitation(invitee.id, rawToken),
      ]);

      const successfulResults = results.filter(
        (result) => result.status === "fulfilled"
      );

      const failedResults = results.filter(
        (result) => result.status === "rejected"
      );

      expect(successfulResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);

      if (failedResults[0].status === "rejected") {
        expect(failedResults[0].reason).toMatchObject({
          statusCode: 409,
        });
      }

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toMatchObject({
        organizationId: organization.id,
        userId: invitee.id,
        role: "member",
        status: "active",
      });

      const assignedRoles = await testPool.query(
        `SELECT r.key
        FROM organization_member_roles omr
        INNER JOIN roles r
        ON r.id = omr.role_id
        WHERE omr.organization_id = $1
        AND omr.user_id = $2`,
        [organization.id, invitee.id]
      );

      expect(assignedRoles.rows).toEqual([
        { key: "member" },
      ]);

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        id: invitation.id,
        status: "accepted",
        acceptedBy: invitee.id,
      });
    });

    it("should reject acceptance when the invitation is revoked after the initial token lookup", async () => {
      const owner = await createUser("revoke-race-owner@example.com");
      const invitee = await createUser("revoke-race-invitee@example.com");

      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-revoked-race"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      let releaseInitialLookup: (() => void) | undefined;
      let allowAcceptanceToContinue: (() => void) | undefined;

      const initialLookupReached = new Promise<void>((resolve) => {
        releaseInitialLookup = resolve;
      });

      const acceptanceMayContinue = new Promise<void>((resolve) => {
        allowAcceptanceToContinue = resolve;
      });

      const synchronizedInvitationRepository = new Proxy(
        invitationRepository,
        {
          get(target, property) {
            if (property === "findByTokenHash") {
              return async (
                ...args: Parameters<typeof target.findByTokenHash>
              ) => {
                const result = await target.findByTokenHash(...args);

                // Pause acceptance after its initial lookup,
                // before it acquires the organization/email lock.
                releaseInitialLookup?.();

                await acceptanceMayContinue;

                return result;
              };
            }

            const value = Reflect.get(target, property, target);

            return typeof value === "function"
              ? value.bind(target)
              : value;
          },
        }
      );

      const service = new InvitationService(
        synchronizedInvitationRepository,
        organizationRepository,
        organizationMemberRepository,
        userRepository,
        roleAssignmentRepository,
        permissionService,
        tokenService,
        emailService,
        transactionManager,
        "http://localhost:4200"
      );

      const acceptancePromise = service.acceptInvitation(
        invitee.id,
        rawToken
      );

      // Wait until acceptance has completed its initial token lookup.
      await initialLookupReached;

      let revoked;

      try {
        // Revoke and commit using a separate transaction.
        revoked = await service.revokeInvitation(
          organization.id,
          invitation.id,
          owner.id
        );
      } finally {
        // Always release acceptance, even if revocation fails.
        allowAcceptanceToContinue?.();
      }

      expect(revoked.status).toBe("revoked");

      // Acceptance must detect the revoked status on its locked re-read.
      await expect(acceptancePromise).rejects.toMatchObject({
        statusCode: 409,
      });

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        id: invitation.id,
        status: "revoked",
        acceptedBy: null,
        acceptedAt: null,
      });

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toBeUndefined();

      const assignedRoles = await testPool.query(
        `SELECT 1
        FROM organization_member_roles
        WHERE organization_id = $1
          AND user_id = $2`,
        [organization.id, invitee.id]
      );

      expect(assignedRoles.rows).toHaveLength(0);
    });

    it("should reject the old token when resend replaces it during acceptance", async () => {
      const owner = await createUser("resend-race-owner@example.com");
      const invitee = await createUser("resend-race-invitee@example.com");

      await verifyUser(owner.id);
      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-resend-race"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      // Complete the original delivery attempt so that resend is permitted.
      expect(invitation.emailDeliveryAttemptId).toBeTruthy();

      await invitationRepository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: invitation.emailDeliveryAttemptId!,
        status: "sent",
        sentAt: new Date(),
      });

      const sentInvitationUrls: string[] = [];

      const resendEmailService = {
        sendVerificationEmail: async () => {},
        sendInvitationEmail: async (input: { invitationUrl: string }) => {
          sentInvitationUrls.push(input.invitationUrl);
        },
      };

      const resendService = new InvitationService(
        invitationRepository,
        organizationRepository,
        organizationMemberRepository,
        userRepository,
        roleAssignmentRepository,
        permissionService,
        tokenService,
        resendEmailService,
        transactionManager,
        "http://localhost:4200"
      );

      let releaseInitialLookup: (() => void) | undefined;
      let allowAcceptanceToContinue: (() => void) | undefined;

      const initialLookupReached = new Promise<void>((resolve) => {
        releaseInitialLookup = resolve;
      });

      const acceptanceMayContinue = new Promise<void>((resolve) => {
        allowAcceptanceToContinue = resolve;
      });

      const synchronizedInvitationRepository = new Proxy(
        invitationRepository,
        {
          get(target, property) {
            if (property === "findByTokenHash") {
              return async (
                ...args: Parameters<typeof target.findByTokenHash>
              ) => {
                const result = await target.findByTokenHash(...args);

                // Pause after the old token has been found,
                // before acceptance acquires the organization/email lock.
                releaseInitialLookup?.();

                await acceptanceMayContinue;

                return result;
              };
            }

            const value = Reflect.get(target, property, target);

            return typeof value === "function"
              ? value.bind(target)
              : value;
          },
        }
      );

      const acceptanceService = new InvitationService(
        synchronizedInvitationRepository,
        organizationRepository,
        organizationMemberRepository,
        userRepository,
        roleAssignmentRepository,
        permissionService,
        tokenService,
        emailService,
        transactionManager,
        "http://localhost:4200"
      );

      const acceptancePromise = acceptanceService.acceptInvitation(
        invitee.id,
        rawToken
      );

      // Wait until acceptance has completed its initial lookup.
      await initialLookupReached;

      try {
        // Replace the token and complete the resend operation.
        await resendService.resendInvitation(
          organization.id,
          invitation.id,
          owner.id
        );
      } finally {
        // Always allow acceptance to continue.
        allowAcceptanceToContinue?.();
      }

      // The old token must no longer resolve to an invitation.
      await expect(acceptancePromise).rejects.toMatchObject({
        statusCode: 400,
      });

      expect(sentInvitationUrls).toHaveLength(1);

      const replacementUrl = new URL(sentInvitationUrls[0]);
      const replacementToken = decodeURIComponent(
        replacementUrl.hash.replace("#token=", "")
      );

      expect(replacementToken).toBeTruthy();
      expect(replacementToken).not.toBe(rawToken);

      // The replacement token must still be valid.
      const replacementAcceptance = await createService().acceptInvitation(
        invitee.id,
        replacementToken
      );

      expect(replacementAcceptance).toMatchObject({
        id: invitation.id,
        status: "accepted",
        acceptedBy: invitee.id,
      });

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toMatchObject({
        organizationId: organization.id,
        userId: invitee.id,
        status: "active",
      });

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        id: invitation.id,
        status: "accepted",
        acceptedBy: invitee.id,
      });
    });

    it("should reject resend when acceptance locks the invitation first", async () => {
      const owner = await createUser("accept-first-owner@example.com");
      const invitee = await createUser("accept-first-invitee@example.com");

      await verifyUser(owner.id);
      await verifyUser(invitee.id);

      const organization = await createOrganization(
        owner.id,
        "invitation-accept-first-resend-race"
      );

      const { invitation, rawToken } = await createInvitation(
        organization.id,
        owner.id,
        invitee.email,
        "member"
      );

      await invitationRepository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: invitation.emailDeliveryAttemptId!,
        status: "sent",
        sentAt: new Date(),
      });

      let releaseLockedLookup: (() => void) | undefined;
      let allowAcceptanceToContinue: (() => void) | undefined;

      const lockedLookupReached = new Promise<void>((resolve) => {
        releaseLockedLookup = resolve;
      });

      const acceptanceMayContinue = new Promise<void>((resolve) => {
        allowAcceptanceToContinue = resolve;
      });

      const synchronizedInvitationRepository = new Proxy(
        invitationRepository,
        {
          get(target, property) {
            if (property === "findByTokenHashForUpdate") {
              return async (
                ...args: Parameters<typeof target.findByTokenHashForUpdate>
              ) => {
                // Execute the real SELECT ... FOR UPDATE first.
                const result = await target.findByTokenHashForUpdate(...args);

                // The row lock is now held by acceptance's transaction.
                releaseLockedLookup?.();

                await acceptanceMayContinue;

                return result;
              };
            }

            const value = Reflect.get(target, property, target);

            return typeof value === "function"
              ? value.bind(target)
              : value;
          },
        }
      );

      const acceptanceService = new InvitationService(
        synchronizedInvitationRepository,
        organizationRepository,
        organizationMemberRepository,
        userRepository,
        roleAssignmentRepository,
        permissionService,
        tokenService,
        emailService,
        transactionManager,
        "http://localhost:4200"
      );

      const resendService = createService();

      const acceptancePromise = acceptanceService.acceptInvitation(
        invitee.id,
        rawToken
      );

      // Wait until acceptance has acquired the actual PostgreSQL row lock.
      await lockedLookupReached;

      let resendSettled = false;

      const resendPromise = resendService
        .resendInvitation(organization.id, invitation.id, owner.id)
        .finally(() => {
          resendSettled = true;
        });

      try {
        // Give the resend transaction time to reach its blocked UPDATE.
        await new Promise<void>((resolve) => setTimeout(resolve, 100));

        expect(resendSettled).toBe(false);
      } finally {
        // Commit acceptance and release the row lock.
        allowAcceptanceToContinue?.();
      }

      const acceptedInvitation = await acceptancePromise;

      expect(acceptedInvitation).toMatchObject({
        id: invitation.id,
        status: "accepted",
        acceptedBy: invitee.id,
      });

      await expect(resendPromise).rejects.toMatchObject({
        statusCode: 409,
      });

      const persistedInvitation =
        await invitationRepository.findByIdForOrganization(
          organization.id,
          invitation.id
        );

      expect(persistedInvitation).toMatchObject({
        id: invitation.id,
        status: "accepted",
        acceptedBy: invitee.id,
      });

      const membership =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          invitee.id
        );

      expect(membership).toMatchObject({
        organizationId: organization.id,
        userId: invitee.id,
        status: "active",
      });
    });
  });
});
