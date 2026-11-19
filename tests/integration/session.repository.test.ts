import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { randomBytes } from "node:crypto";

import { testPool } from "../../src/config/test-database.js";

import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresSessionRepository } from "../../src/sessions/postgres-session.repository.js";

describe("PostgresSessionRepository", () => {
  const userRepository = new PostgresUserRepository(testPool);
  const repository = new PostgresSessionRepository(testPool);

  const createUser = async (
    email = "alex@example.com"
  ) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName: "Alex",
    });
  };

  const createSession = async (
    userId: string,
    overrides: {
      tokenHash?: string;
      expiresAt?: Date;
    } = {}
  ) => {
    return repository.create({
      userId,
      tokenHash:
        overrides.tokenHash ??
        randomBytes(32).toString("hex"),
      expiresAt:
        overrides.expiresAt ??
        new Date(Date.now() + 60 * 60 * 1000),
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

  it("should create a session", async () => {
    const user = await createUser();
    const session = await createSession(user.id);

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user.id);
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.lastUsedAt).toBeNull();
    expect(session.revokedAt).toBeNull();
    expect(session.createdAt).toBeInstanceOf(Date);
  });

  it("should store the token hash instead of a raw token", async () => {
    const user = await createUser();

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = randomBytes(32).toString("hex");

    await createSession(user.id, { tokenHash });

    const result = await testPool.query<{
      token_hash: string;
    }>(
      `SELECT token_hash
      FROM sessions
      WHERE user_id = $1`,
      [user.id]
    );

    expect(result.rows[0]?.token_hash).toBe(tokenHash);
    expect(result.rows[0]?.token_hash).not.toBe(rawToken);
  });

  it("should find an active session by token hash", async () => {
    const user = await createUser();
    const tokenHash = randomBytes(32).toString("hex");

    const created = await createSession(user.id, {
      tokenHash,
    });

    const session =
      await repository.findActiveByTokenHash(tokenHash);

    expect(session?.id).toBe(created.id);
    expect(session?.userId).toBe(user.id);
  });

  it("should return undefined for an unknown token hash", async () => {
    const session =
      await repository.findActiveByTokenHash(
        randomBytes(32).toString("hex")
      );

    expect(session).toBeUndefined();
  });

  it("should not find an expired session", async () => {
    const user = await createUser();
    const tokenHash = randomBytes(32).toString("hex");

    const created = await createSession(user.id, {
      tokenHash,
    });

    await testPool.query(
      `UPDATE sessions
      SET
        created_at = NOW() - INTERVAL '2 days',
        expires_at = NOW() - INTERVAL '1 day'
      WHERE id = $1`,
      [created.id]
    );

    const session =
      await repository.findActiveByTokenHash(tokenHash);

    expect(session).toBeUndefined();
  });

  it("should update the last used timestamp", async () => {
    const user = await createUser();
    const created = await createSession(user.id);

    expect(created.lastUsedAt).toBeNull();

    const updated = await repository.updateLastUsed(
      created.id
    );

    expect(updated?.id).toBe(created.id);
    expect(updated?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("should not update an expired session", async () => {
    const user = await createUser();
    const created = await createSession(user.id);

    await testPool.query(
      `UPDATE sessions
      SET
        created_at = NOW() - INTERVAL '2 days',
        expires_at = NOW() - INTERVAL '1 day'
      WHERE id = $1`,
      [created.id]
    );

    const updated = await repository.updateLastUsed(
      created.id
    );

    expect(updated).toBeUndefined();
  });

  it("should revoke an active session", async () => {
    const user = await createUser();
    const tokenHash = randomBytes(32).toString("hex");

    const created = await createSession(user.id, {
      tokenHash,
    });

    const revoked = await repository.revoke(created.id);

    expect(revoked?.id).toBe(created.id);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);

    expect(
      await repository.findActiveByTokenHash(tokenHash)
    ).toBeUndefined();
  });

  it("should not revoke an already revoked session twice", async () => {
    const user = await createUser();
    const created = await createSession(user.id);

    const firstRevocation = await repository.revoke(
      created.id
    );

    const secondRevocation = await repository.revoke(
      created.id
    );

    expect(firstRevocation?.revokedAt).toBeInstanceOf(Date);
    expect(secondRevocation).toBeUndefined();
  });

  it("should revoke all active sessions belonging to a user", async () => {
    const firstUser = await createUser(
      "alex@example.com"
    );

    const secondUser = await createUser(
      "jordan@example.com"
    );

    const firstSession = await createSession(firstUser.id);
    const secondSession = await createSession(firstUser.id);

    const otherUserSession = await createSession(
      secondUser.id
    );

    const revokedCount =
      await repository.revokeAllByUserId(firstUser.id);

    expect(revokedCount).toBe(2);

    expect(
      await repository.findActiveByTokenHash(
        await getTokenHash(firstSession.id)
      )
    ).toBeUndefined();

    expect(
      await repository.findActiveByTokenHash(
        await getTokenHash(secondSession.id)
      )
    ).toBeUndefined();

    expect(
      await repository.findActiveByTokenHash(
        await getTokenHash(otherUserSession.id)
      )
    ).toBeDefined();
  });

  it("should return zero when a user has no active sessions", async () => {
    const user = await createUser();

    const revokedCount =
      await repository.revokeAllByUserId(user.id);

    expect(revokedCount).toBe(0);
  });

  async function getTokenHash(
    sessionId: string
  ): Promise<string> {
    const result = await testPool.query<{
      token_hash: string;
    }>(
      `SELECT token_hash
      FROM sessions
      WHERE id = $1`,
      [sessionId]
    );

    return result.rows[0]!.token_hash;
  }
});
