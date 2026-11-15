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

import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { TokenService } from "../../src/auth/token.service.js";
import { EmailVerificationService } from "../../src/auth/email-verification.service.js";
import { UserService } from "../../src/users/user.service.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresAuthTokenRepository } from "../../src/auth-tokens/postgres-auth-token.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";

describe("EmailVerificationService integration", () => {
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

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const authTokenRepository = new PostgresAuthTokenRepository(
    testPool,
    transactionManager
  );

  const passwordService = new PasswordService();
  const tokenService = new TokenService();

  const userService = new UserService(
    userRepository,
    organizationRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    authTokenRepository,
    transactionManager,
    passwordService,
    tokenService
  );

  const verificationService = new EmailVerificationService(
    userRepository,
    authTokenRepository,
    transactionManager,
    tokenService
  );

  const registerUser = async (
    email = "alex@example.com"
  ) => {
    return userService.register({
      email,
      password: "StrongPassword123!",
      displayName: "Alex Morgan",
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

  it("should verify a user's email and activate the account", async () => {
    const registration = await registerUser();

    const result = await verificationService.verify(
      registration.verificationToken
    );

    expect(result.id).toBe(registration.user.id);
    expect(result.status).toBe("active");
    expect(result.emailVerifiedAt).toBeInstanceOf(Date);

    const persistedUser = await userRepository.findById(
      registration.user.id
    );

    expect(persistedUser?.status).toBe("active");
    expect(persistedUser?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("should consume the verification token after successful verification", async () => {
    const registration = await registerUser();

    const tokenHash = tokenService.hash(
      registration.verificationToken
    );

    await verificationService.verify(
      registration.verificationToken
    );

    const token = await authTokenRepository.findActiveByTokenHash(
      tokenHash,
      "email_verification"
    );

    expect(token).toBeUndefined();

    const storedToken = await testPool.query(
      `SELECT consumed_at
       FROM auth_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    expect(storedToken.rows[0].consumed_at).toBeInstanceOf(Date);
  });

  it("should reject an invalid verification token", async () => {
    const registration = await registerUser();

    await expect(
      verificationService.verify("invalid-token")
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired verification token.",
    });

    const user = await userRepository.findById(
      registration.user.id
    );

    expect(user?.status).toBe("pending");
    expect(user?.emailVerifiedAt).toBeNull();
  });

  it("should reject an expired verification token", async () => {
    const registration = await registerUser();

    const tokenHash = tokenService.hash(
      registration.verificationToken
    );

    await testPool.query(
      `UPDATE auth_tokens
       SET created_at = NOW() - INTERVAL '2 days',
           expires_at = NOW() - INTERVAL '1 day'
       WHERE token_hash = $1`,
      [tokenHash]
    );

    await expect(
      verificationService.verify(registration.verificationToken)
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    const user = await userRepository.findById(
      registration.user.id
    );

    expect(user?.status).toBe("pending");
    expect(user?.emailVerifiedAt).toBeNull();
  });

  it("should reject a previously consumed verification token", async () => {
    const registration = await registerUser();

    await verificationService.verify(
      registration.verificationToken
    );

    await expect(
      verificationService.verify(registration.verificationToken)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired verification token.",
    });
  });

  it("should not reactivate a suspended account and should roll back token consumption", async () => {
    const registration = await registerUser();

    await userRepository.updateStatus(
      registration.user.id,
      "suspended"
    );

    await expect(
      verificationService.verify(registration.verificationToken)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "This account cannot be activated.",
    });

    const persistedUser = await userRepository.findById(
      registration.user.id
    );

    expect(persistedUser?.status).toBe("suspended");
    expect(persistedUser?.emailVerifiedAt).toBeNull();

    const tokenHash = tokenService.hash(
      registration.verificationToken
    );

    const token = await authTokenRepository.findActiveByTokenHash(
      tokenHash,
      "email_verification"
    );

    // Failed activation must roll back token consumption.
    expect(token).toBeDefined();
  });

  it("should allow only one successful verification when two requests run concurrently", async () => {
    const registration = await registerUser();

    const results = await Promise.allSettled([
      verificationService.verify(registration.verificationToken),
      verificationService.verify(registration.verificationToken),
    ]);

    const successfulResults = results.filter(
      (result) => result.status === "fulfilled"
    );

    const rejectedResults = results.filter(
      (result) => result.status === "rejected"
    );

    expect(successfulResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);

    const persistedUser = await userRepository.findById(
      registration.user.id
    );

    expect(persistedUser?.status).toBe("active");
    expect(persistedUser?.emailVerifiedAt).toBeInstanceOf(Date);
  });
});
