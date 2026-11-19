import type { PoolClient } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresInvitationRepository } from "../../src/invitations/postgres-invitation.repository.js";

describe("PostgresInvitationRepository integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

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

  const repository = new PostgresInvitationRepository(
    testPool,
    transactionManager
  );

  const createOwner = async (email = "owner@example.com") => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName: "Organization Owner",
    });
  };

  const createOrganization = async (ownerUserId: string) => {
    return transactionManager.runInTransaction(
      "createInvitationTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: "Invitation Test Workspace",
            slug: `invitation-${crypto.randomUUID()}`,
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

        return organization;
      }
    );
  };

  const createInvitation = async (
    organizationId: string,
    invitedBy: string,
    email = "invitee@example.com",
    roleKey: "admin" | "member" = "member"
  ) => {
    return repository.create({
      organizationId,
      email,
      roleKey,
      tokenHash: randomBytes(32).toString("hex"),
      invitedBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      emailDeliveryAttemptId: randomUUID(),
      emailDeliveryStartedAt: new Date(),
    });
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

  it("should create an organization invitation with its canonical role", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    expect(invitation).toMatchObject({
      organizationId: organization.id,
      projectId: null,
      email: "invitee@example.com",
      roleKey: "member",
      roleName: expect.any(String),
      invitedBy: owner.id,
      acceptedBy: null,
      status: "pending",
      emailDeliveryStatus: "pending",
      emailDeliveryAttempts: 1,
      emailLastAttemptAt: expect.any(Date),
      emailSentAt: null,
      emailDeliveryAttemptId: expect.any(String),
      emailDeliveryStartedAt: expect.any(Date),
    });

    expect(invitation.id).toBeDefined();
    expect(invitation.roleId).toBeDefined();
    expect(invitation.expiresAt).toBeInstanceOf(Date);
    expect(invitation.createdAt).toBeInstanceOf(Date);
  });

  it("should create an admin invitation when the admin role is selected", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id,
      "admin-invitee@example.com",
      "admin"
    );

    expect(invitation.roleKey).toBe("admin");
  });

  it("should reject creation when the built-in organization role does not exist", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    await expect(
      repository.create({
        organizationId: organization.id,
        email: "missing-role@example.com",
        roleKey: "missing-role" as never,
        tokenHash: randomBytes(32).toString("hex"),
        invitedBy: owner.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        emailDeliveryAttemptId: randomUUID(),
        emailDeliveryStartedAt: new Date(),
      })
    ).rejects.toThrow(
      'Built-in organization role "missing-role" does not exist.'
    );
  });

  it("should reject creation when the created invitation cannot be retrieved", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const findSpy = vi
      .spyOn(repository, "findByIdForOrganization")
      .mockResolvedValueOnce(undefined);

    await expect(
      createInvitation(
        organization.id,
        owner.id,
        "unretrievable@example.com"
      )
    ).rejects.toThrow("Created invitation could not be retrieved.");

    findSpy.mockRestore();

    const invitations = await repository.findAllByOrganizationId(
      organization.id
    );

    expect(invitations).toHaveLength(0);
  });

  it("should reject duplicate pending invitations for the same organization and email", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    await createInvitation(
      organization.id,
      owner.id,
      "duplicate@example.com"
    );

    await expect(createInvitation(
      organization.id,
      owner.id,
      "duplicate@example.com"
    )).rejects.toMatchObject({
      code: "23505",
      constraint: "idx_invitations_pending_organization_email",
    });
  });

  it("should allow the same email to be invited to different organizations", async () => {
    const firstOwner = await createOwner("first-owner@example.com");
    const secondOwner = await createOwner("second-owner@example.com");

    const firstOrganization = await createOrganization(firstOwner.id);
    const secondOrganization = await createOrganization(secondOwner.id);

    const firstInvitation = await createInvitation(
      firstOrganization.id,
      firstOwner.id,
      "shared@example.com"
    );

    const secondInvitation = await createInvitation(
      secondOrganization.id,
      secondOwner.id,
      "shared@example.com"
    );

    expect(firstInvitation.id).not.toBe(secondInvitation.id);
    expect(firstInvitation.organizationId).not.toBe(
      secondInvitation.organizationId
    );
  });

  it("should expire pending invitations before allowing a replacement invitation", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const existing = await createInvitation(
      organization.id,
      owner.id,
      "expired@example.com"
    );

    await testPool.query(
      `UPDATE invitations
      SET
        created_at = NOW() - INTERVAL '2 days',
        expires_at = NOW() - INTERVAL '1 day'
      WHERE id = $1`,
      [existing.id]
    );

    const expiredCount =
      await repository.expirePendingByOrganizationAndEmail(
        organization.id,
        "expired@example.com"
      );

    expect(expiredCount).toBe(1);

    const replacement = await createInvitation(
      organization.id,
      owner.id,
      "expired@example.com"
    );

    expect(replacement.status).toBe("pending");

    const previous = await repository.findByIdForOrganization(
      organization.id,
      existing.id
    );

    expect(previous?.status).toBe("expired");
  });

  it("should list only invitations belonging to the requested organization", async () => {
    const firstOwner = await createOwner("list-first@example.com");
    const secondOwner = await createOwner("list-second@example.com");

    const firstOrganization = await createOrganization(firstOwner.id);
    const secondOrganization = await createOrganization(secondOwner.id);

    await createInvitation(
      firstOrganization.id,
      firstOwner.id,
      "first@example.com"
    );

    await createInvitation(
      secondOrganization.id,
      secondOwner.id,
      "second@example.com"
    );

    const invitations = await repository.findAllByOrganizationId(
      firstOrganization.id
    );

    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.email).toBe("first@example.com");
    expect(invitations[0]?.organizationId).toBe(firstOrganization.id);
  });

  it("should not find an invitation through another organization", async () => {
    const firstOwner = await createOwner("tenant-first@example.com");
    const secondOwner = await createOwner("tenant-second@example.com");

    const firstOrganization = await createOrganization(firstOwner.id);
    const secondOrganization = await createOrganization(secondOwner.id);

    const invitation = await createInvitation(
      firstOrganization.id,
      firstOwner.id
    );

    const result = await repository.findByIdForOrganization(
      secondOrganization.id,
      invitation.id
    );

    expect(result).toBeUndefined();
  });

  it("should find an invitation by its token hash while holding a row lock", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);
    const tokenHash = randomBytes(32).toString("hex");

    const invitation = await repository.create({
      organizationId: organization.id,
      email: "token@example.com",
      roleKey: "member",
      tokenHash,
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      emailDeliveryAttemptId: randomUUID(),
      emailDeliveryStartedAt: new Date(),
    });

    const result = await transactionManager.runInTransaction(
      "findInvitationByToken",
      async (client) =>
        repository.findByTokenHashForUpdate(tokenHash, client)
    );

    expect(result?.id).toBe(invitation.id);
    expect(result?.email).toBe("token@example.com");
  });

  it("should acquire an organization email advisory lock using a normalized email", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    await expect(
      transactionManager.runInTransaction(
        "lockOrganizationInvitationEmail",
        async (client) => {
          await repository.lockOrganizationEmail(
            organization.id,
            "  Invitee@Example.COM  ",
            client
          );
        }
      )
    ).resolves.toBeUndefined();
  });

  it("should use the same advisory lock for differently formatted email addresses", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const firstClient = await testPool.connect();
    const secondClient = await testPool.connect();

    try {
      await firstClient.query("BEGIN");
      await secondClient.query("BEGIN");

      // First connection acquires the lock using mixed case and whitespace.
      await repository.lockOrganizationEmail(
        organization.id,
        "  Invitee@Example.COM  ",
        firstClient
      );

      // Second connection tries the equivalent normalized lock.
      const blockedResult = await secondClient.query<{
        acquired: boolean;
      }>(
        `SELECT pg_try_advisory_xact_lock(
          hashtext($1),
          hashtext($2)
        ) AS acquired`,
        [organization.id, "invitee@example.com"]
      );

      expect(blockedResult.rows[0]?.acquired).toBe(false);

      // Releasing the first transaction must release its advisory lock.
      await firstClient.query("ROLLBACK");

      const acquiredResult = await secondClient.query<{
        acquired: boolean;
      }>(
        `SELECT pg_try_advisory_xact_lock(
          hashtext($1),
          hashtext($2)
        ) AS acquired`,
        [organization.id, "invitee@example.com"]
      );

      expect(acquiredResult.rows[0]?.acquired).toBe(true);

      await secondClient.query("ROLLBACK");
    } finally {
      await firstClient.query("ROLLBACK").catch(() => {});
      await secondClient.query("ROLLBACK").catch(() => {});

      firstClient.release();
      secondClient.release();
    }
  });

  it("should find an invitation by token hash without acquiring a row lock", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const tokenHash = randomBytes(32).toString("hex");

    const invitation = await repository.create({
      organizationId: organization.id,
      email: "unlocked-token@example.com",
      roleKey: "member",
      tokenHash,
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      emailDeliveryAttemptId: randomUUID(),
      emailDeliveryStartedAt: new Date(),
    });

    const result = await transactionManager.runInTransaction(
      "findInvitationWithoutRowLock",
      async (client) =>
        repository.findByTokenHash(tokenHash, client)
    );

    expect(result?.id).toBe(invitation.id);
    expect(result?.email).toBe("unlocked-token@example.com");

    const missing = await transactionManager.runInTransaction(
      "findMissingInvitationWithoutRowLock",
      async (client) =>
        repository.findByTokenHash(
          randomBytes(32).toString("hex"),
          client
        )
    );

    expect(missing).toBeUndefined();
  });

  it("should replace a stale invitation token and invalidate the previous token", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const oldTokenHash = randomBytes(32).toString("hex");
    const newTokenHash = randomBytes(32).toString("hex");

    const invitation = await repository.create({
      organizationId: organization.id,
      email: "rotation@example.com",
      roleKey: "member",
      tokenHash: oldTokenHash,
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      emailDeliveryAttemptId: randomUUID(),
      emailDeliveryStartedAt: new Date(),
    });

    // Simulate an abandoned delivery attempt that is over 10 minutes old.
    await testPool.query(
      `
        UPDATE invitations
        SET email_delivery_started_at =
          NOW() - INTERVAL '11 minutes'
        WHERE id = $1
      `,
      [invitation.id]
    );

    const replacementAttemptId = randomUUID();
    const replacementStartedAt = new Date();

    const replacement = await transactionManager.runInTransaction(
      "replaceInvitationToken",
      async (client) =>
        repository.replaceToken(
          {
            organizationId: organization.id,
            invitationId: invitation.id,
            tokenHash: newTokenHash,
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ),
            emailDeliveryAttemptId: replacementAttemptId,
            emailDeliveryStartedAt: replacementStartedAt,
            staleAttemptBefore: new Date(
              Date.now() - 10 * 60 * 1000
            ),
          },
          client
        )
    );

    expect(replacement).toMatchObject({
      id: invitation.id,
      emailDeliveryStatus: "pending",
      emailDeliveryAttempts: 2,
      emailDeliveryAttemptId: replacementAttemptId,
    });

    expect(replacement?.emailSentAt).toBeNull();

    const oldToken = await transactionManager.runInTransaction(
      "findOldInvitationToken",
      async (client) =>
        repository.findByTokenHashForUpdate(oldTokenHash, client)
    );

    const newToken = await transactionManager.runInTransaction(
      "findNewInvitationToken",
      async (client) =>
        repository.findByTokenHashForUpdate(newTokenHash, client)
    );

    expect(oldToken).toBeUndefined();
    expect(newToken?.id).toBe(invitation.id);
  });

  it("should return undefined when the replaced invitation cannot be retrieved", async () => {
    const invitationId = randomUUID();

    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: invitationId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const client = {
      query,
    } as unknown as PoolClient;

    const result = await repository.replaceToken(
      {
        organizationId: randomUUID(),
        invitationId,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        emailDeliveryAttemptId: randomUUID(),
        emailDeliveryStartedAt: new Date(),
        staleAttemptBefore: new Date(Date.now() - 10 * 60 * 1000),
      },
      client
    );

    expect(result).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should allow only one concurrent resend to claim an invitation", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    // Complete the initial delivery attempt before testing resends.
    const initialAttemptId = invitation.emailDeliveryAttemptId!;

    const initialDeliveryRecorded =
      await repository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: initialAttemptId,
        status: "sent",
        sentAt: new Date(),
      });

    expect(initialDeliveryRecorded).toBe(true);

    const createReplacement = (
      tokenHash: string,
      attemptId: string
    ) =>
      transactionManager.runInTransaction(
        "concurrentInvitationTokenReplacement",
        async (client) =>
          repository.replaceToken(
            {
              organizationId: organization.id,
              invitationId: invitation.id,
              tokenHash,
              expiresAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ),
              emailDeliveryAttemptId: attemptId,
              emailDeliveryStartedAt: new Date(),
              staleAttemptBefore: new Date(
                Date.now() - 10 * 60 * 1000
              ),
            },
            client
          )
      );

    const firstAttemptId = randomUUID();
    const secondAttemptId = randomUUID();

    const [firstResult, secondResult] = await Promise.all([
      createReplacement(
        randomBytes(32).toString("hex"),
        firstAttemptId
      ),
      createReplacement(
        randomBytes(32).toString("hex"),
        secondAttemptId
      ),
    ]);

    const successfulResults = [
      firstResult,
      secondResult,
    ].filter((result) => result !== undefined);

    expect(successfulResults).toHaveLength(1);

    const winner = successfulResults[0]!;

    expect([
      firstAttemptId,
      secondAttemptId,
    ]).toContain(winner.emailDeliveryAttemptId);

    const persisted = await repository.findByIdForOrganization(
      organization.id,
      invitation.id
    );

    expect(persisted?.emailDeliveryAttemptId).toBe(
      winner.emailDeliveryAttemptId
    );
    expect(persisted?.emailDeliveryAttempts).toBe(2);
  });

  it("should prevent a stale delivery attempt from overwriting a newer attempt", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    const oldAttemptId = invitation.emailDeliveryAttemptId!;

    const newAttemptId = randomUUID();

    const replacement = await transactionManager.runInTransaction(
      "takeOverStaleInvitationDelivery",
      async (client) =>
        repository.replaceToken(
          {
            organizationId: organization.id,
            invitationId: invitation.id,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ),
            emailDeliveryAttemptId: newAttemptId,
            emailDeliveryStartedAt: new Date(),
            // The existing attempt is considered stale.
            staleAttemptBefore: new Date(Date.now() + 1000),
          },
          client
        )
    );

    expect(replacement?.emailDeliveryAttemptId).toBe(newAttemptId);
    expect(replacement?.emailDeliveryAttempts).toBe(2);

    // The old provider request completes after the replacement.
    const oldDeliveryRecorded =
      await repository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: oldAttemptId,
        status: "sent",
        sentAt: new Date(),
      });

    expect(oldDeliveryRecorded).toBe(false);

    const unchanged = await repository.findByIdForOrganization(
      organization.id,
      invitation.id
    );

    expect(unchanged?.emailDeliveryAttemptId).toBe(newAttemptId);
    expect(unchanged?.emailDeliveryStatus).toBe("pending");

    // The currently active attempt can still record its result.
    const newDeliveryRecorded =
      await repository.recordEmailDelivery({
        invitationId: invitation.id,
        emailDeliveryAttemptId: newAttemptId,
        status: "sent",
        sentAt: new Date(),
      });

    expect(newDeliveryRecorded).toBe(true);

    const completed = await repository.findByIdForOrganization(
      organization.id,
      invitation.id
    );

    expect(completed?.emailDeliveryStatus).toBe("sent");
    expect(completed?.emailDeliveryAttemptId).toBeNull();
  });

  it("should not replace an invitation token through another organization", async () => {
    const firstOwner = await createOwner("rotation-first@example.com");
    const secondOwner = await createOwner("rotation-second@example.com");

    const firstOrganization = await createOrganization(firstOwner.id);
    const secondOrganization = await createOrganization(secondOwner.id);

    const invitation = await createInvitation(
      firstOrganization.id,
      firstOwner.id
    );

    const result = await transactionManager.runInTransaction(
      "rejectCrossOrganizationTokenReplacement",
      async (client) =>
        repository.replaceToken(
          {
            organizationId: secondOrganization.id,
            invitationId: invitation.id,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ),
            emailDeliveryAttemptId: randomUUID(),
            emailDeliveryStartedAt: new Date(),
            staleAttemptBefore: new Date(
              Date.now() - 10 * 60 * 1000
            ),
          },
          client
        )
    );

    expect(result).toBeUndefined();
  });

  it("should track successful email delivery attempts", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    expect(invitation.emailDeliveryAttemptId).toBeTruthy();

    const sentAt = new Date();

    const recorded = await repository.recordEmailDelivery({
      invitationId: invitation.id,
      emailDeliveryAttemptId:
        invitation.emailDeliveryAttemptId!,
      status: "sent",
      sentAt,
    });

    expect(recorded).toBe(true);

    const result = await repository.findByIdForOrganization(
      organization.id,
      invitation.id
    );

    expect(result).toMatchObject({
      emailDeliveryStatus: "sent",
      emailDeliveryAttempts: 1,
      emailDeliveryAttemptId: null,
      emailDeliveryStartedAt: null,
    });

    expect(result?.emailLastAttemptAt).toBeInstanceOf(Date);
    expect(result?.emailSentAt).toBeInstanceOf(Date);
  });

  it("should track failed email delivery attempts", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    const recorded = await repository.recordEmailDelivery({
      invitationId: invitation.id,
      emailDeliveryAttemptId:
        invitation.emailDeliveryAttemptId!,
      status: "failed",
      sentAt: null,
    });

    expect(recorded).toBe(true);

    const result = await repository.findByIdForOrganization(
      organization.id,
      invitation.id
    );

    expect(result).toMatchObject({
      emailDeliveryStatus: "failed",
      emailDeliveryAttempts: 1,
      emailSentAt: null,
      emailDeliveryAttemptId: null,
      emailDeliveryStartedAt: null,
    });
  });

  it("should revoke a pending invitation", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitation = await createInvitation(
      organization.id,
      owner.id
    );

    const revoked = await repository.revoke(
      organization.id,
      invitation.id
    );

    expect(revoked?.status).toBe("revoked");
    expect(revoked?.acceptedBy).toBeNull();
  });

  it("should not revoke an invitation belonging to another organization", async () => {
    const firstOwner = await createOwner("revoke-first@example.com");
    const secondOwner = await createOwner("revoke-second@example.com");

    const firstOrganization = await createOrganization(firstOwner.id);
    const secondOrganization = await createOrganization(secondOwner.id);

    const invitation = await createInvitation(
      firstOrganization.id,
      firstOwner.id
    );

    const result = await repository.revoke(
      secondOrganization.id,
      invitation.id
    );

    expect(result).toBeUndefined();

    const unchanged = await repository.findByIdForOrganization(
      firstOrganization.id,
      invitation.id
    );

    expect(unchanged?.status).toBe("pending");
  });

  it("should mark a pending invitation as accepted", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitee = await userRepository.create({
      email: "accepted@example.com",
      passwordHash: "test-password-hash",
      displayName: "Accepted User",
    });

    const invitation = await createInvitation(
      organization.id,
      owner.id,
      invitee.email
    );

    const accepted = await transactionManager.runInTransaction(
      "acceptInvitation",
      async (client) =>
        repository.markAccepted(invitation.id, invitee.id, client)
    );

    expect(accepted).toMatchObject({
      id: invitation.id,
      status: "accepted",
      acceptedBy: invitee.id,
    });

    expect(accepted?.acceptedAt).toBeInstanceOf(Date);
  });

  it("should not accept an invitation more than once", async () => {
    const owner = await createOwner();
    const organization = await createOrganization(owner.id);

    const invitee = await userRepository.create({
      email: "single-use@example.com",
      passwordHash: "test-password-hash",
      displayName: "Single Use User",
    });

    const invitation = await createInvitation(
      organization.id,
      owner.id,
      invitee.email
    );

    await transactionManager.runInTransaction(
      "firstInvitationAcceptance",
      async (client) =>
        repository.markAccepted(invitation.id, invitee.id, client)
    );

    const secondAcceptance = await transactionManager.runInTransaction(
      "secondInvitationAcceptance",
      async (client) =>
        repository.markAccepted(invitation.id, invitee.id, client)
    );

    expect(secondAcceptance).toBeUndefined();
  });
});
