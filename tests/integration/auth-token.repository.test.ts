import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresAuthTokenRepository } from "../../src/auth-tokens/postgres-auth-token.repository.js";

describe("PostgresAuthTokenRepository", () => {
  const userRepository = new PostgresUserRepository(testPool);
  const repository = new PostgresAuthTokenRepository(testPool);

  const createUser = async () => {
    return userRepository.create({
      email: "alex@example.com",
      passwordHash: "test-password-hash",
      displayName: "Alex",
    });
  };

  const createToken = async (
    userId: string,
    overrides: {
      purpose?: "email_verification" | "password_reset";
      tokenHash?: string;
      expiresAt?: Date;
    } = {}
  ) => {
    return repository.create({
      userId,
      purpose: overrides.purpose ?? "email_verification",
      tokenHash:
        overrides.tokenHash ??
        "a".repeat(64),
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

  it("should create an authentication token", async () => {
    const user = await createUser();
    const token = await createToken(user.id);

    expect(token.id).toBeDefined();
    expect(token.userId).toBe(user.id);
    expect(token.purpose).toBe("email_verification");
    expect(token.expiresAt).toBeInstanceOf(Date);
    expect(token.consumedAt).toBeNull();
    expect(token.createdAt).toBeInstanceOf(Date);
  });

  it("should find an active token by hash and purpose", async () => {
    const user = await createUser();
    const tokenHash = "b".repeat(64);

    await createToken(user.id, { tokenHash });

    const token = await repository.findActiveByTokenHash(
      tokenHash,
      "email_verification"
    );

    expect(token?.userId).toBe(user.id);
    expect(token?.purpose).toBe("email_verification");
  });

  it("should not find a token with the wrong purpose", async () => {
    const user = await createUser();
    const tokenHash = "c".repeat(64);

    await createToken(user.id, { tokenHash });

    const token = await repository.findActiveByTokenHash(
      tokenHash,
      "password_reset"
    );

    expect(token).toBeUndefined();
  });


  it("should not find an expired token", async () => {
    const user = await createUser();
    const tokenHash = "d".repeat(64);

    const created = await createToken(user.id, { tokenHash });

    // Simulate a token that expired one day after creation.
    await testPool.query(
        `UPDATE auth_tokens
        SET
        created_at = NOW() - INTERVAL '2 days',
        expires_at = NOW() - INTERVAL '1 day'
        WHERE id = $1`,
        [created.id]
    );

    const token = await repository.findActiveByTokenHash(
        tokenHash,
        "email_verification"
    );

    expect(token).toBeUndefined();
  });


  it("should consume an active token", async () => {
    const user = await createUser();
    const created = await createToken(user.id);

    const consumed = await repository.consume(created.id);

    expect(consumed?.id).toBe(created.id);
    expect(consumed?.consumedAt).toBeInstanceOf(Date);
  });

  it("should not consume the same token twice", async () => {
    const user = await createUser();
    const created = await createToken(user.id);

    await repository.consume(created.id);

    const secondAttempt = await repository.consume(created.id);

    expect(secondAttempt).toBeUndefined();
  });

  it("should invalidate active tokens for a user and purpose", async () => {
    const user = await createUser();

    const first = await createToken(user.id, {
      tokenHash: "e".repeat(64),
    });

    const second = await createToken(user.id, {
      tokenHash: "f".repeat(64),
    });

    const invalidated =
      await repository.invalidateActiveByUserAndPurpose(
        user.id,
        "email_verification"
      );

    expect(invalidated).toBe(2);

    expect(
      await repository.findActiveByTokenHash(
        "e".repeat(64),
        "email_verification"
      )
    ).toBeUndefined();

    expect(
      await repository.findActiveByTokenHash(
        "f".repeat(64),
        "email_verification"
      )
    ).toBeUndefined();

    expect(first.id).not.toBe(second.id);
  });

  it("should not invalidate tokens belonging to another purpose", async () => {
    const user = await createUser();

    const verificationToken = await createToken(user.id, {
      tokenHash: "1".repeat(64),
      purpose: "email_verification",
    });

    const resetToken = await createToken(user.id, {
      tokenHash: "2".repeat(64),
      purpose: "password_reset",
    });

    await repository.invalidateActiveByUserAndPurpose(
      user.id,
      "email_verification"
    );

    expect(
      await repository.findActiveByTokenHash(
        "1".repeat(64),
        "email_verification"
      )
    ).toBeUndefined();

    expect(
      await repository.findActiveByTokenHash(
        "2".repeat(64),
        "password_reset"
      )
    ).toBeDefined();

    expect(verificationToken.id).not.toBe(resetToken.id);
  });
});
