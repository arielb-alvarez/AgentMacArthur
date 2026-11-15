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

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresAuthTokenRepository } from "../../src/auth-tokens/postgres-auth-token.repository.js";

import { UserService } from "../../src/users/user.service.js";

describe("UserService integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const organizationRepository =
    new PostgresOrganizationRepository(
      testPool,
      transactionManager
    );

  const organizationMemberRepository =
    new PostgresOrganizationMemberRepository(
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
    authTokenRepository,
    transactionManager,
    passwordService,
    tokenService
  );

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it("should register a user with a personal organization and owner membership", async () => {
    const result = await userService.register({
      email: "alex@example.com",
      password: "StrongPassword123!",
      displayName: "Alex Morgan",
    });

    expect(result.user.id).toBeDefined();
    expect(result.user.email).toBe("alex@example.com");
    expect(result.user.displayName).toBe("Alex Morgan");
    expect(result.user.status).toBe("pending");
    expect(result.user.emailVerifiedAt).toBeNull();

    const organization =
      await organizationRepository.findPersonalByOwnerId(
        result.user.id
      );

    expect(organization).toBeDefined();
    expect(organization?.type).toBe("personal");
    expect(organization?.ownerUserId).toBe(result.user.id);
    expect(organization?.name).toBe("Alex Morgan's Workspace");

    const membership =
      await organizationMemberRepository.findByOrganizationAndUser(
        organization!.id,
        result.user.id
      );

    expect(membership).toBeDefined();
    expect(membership?.role).toBe("owner");
    expect(membership?.status).toBe("active");
  });

  it("should persist only the verification token hash", async () => {
    const result = await userService.register({
      email: "token@example.com",
      password: "StrongPassword123!",
      displayName: "Token User",
    });

    expect(result.verificationToken).toBeTruthy();

    const tokenHash = tokenService.hash(
      result.verificationToken
    );

    const storedToken =
      await authTokenRepository.findActiveByTokenHash(
        tokenHash,
        "email_verification"
      );

    expect(storedToken).toBeDefined();
    expect(storedToken?.userId).toBe(result.user.id);

    expect(
      storedToken?.expiresAt.getTime()
    ).toBeGreaterThan(Date.now());

    const rawTokenResult = await testPool.query(
      `SELECT id
       FROM auth_tokens
       WHERE token_hash = $1`,
      [result.verificationToken]
    );

    expect(rawTokenResult.rowCount).toBe(0);
  });

  it("should store a password hash instead of the original password", async () => {
    const password = "StrongPassword123!";

    const result = await userService.register({
      email: "password@example.com",
      password,
      displayName: "Password User",
    });

    const credentials =
      await userRepository.findCredentialsByEmail(
        "password@example.com"
      );

    expect(credentials).toBeDefined();
    expect(credentials?.passwordHash).not.toBe(password);

    expect(
      await passwordService.verifyPassword(
        password,
        credentials!.passwordHash
      )
    ).toBe(true);
  });

  it("should normalize the email address during registration", async () => {
    const result = await userService.register({
      email: "  ALEX@EXAMPLE.COM  ",
      password: "StrongPassword123!",
      displayName: "Alex",
    });

    expect(result.user.email).toBe("alex@example.com");

    const user = await userRepository.findByEmail(
      "ALEX@EXAMPLE.COM"
    );

    expect(user?.id).toBe(result.user.id);
  });

  it("should reject duplicate email registration without creating extra records", async () => {
    await userService.register({
      email: "duplicate@example.com",
      password: "StrongPassword123!",
      displayName: "First User",
    });

    await expect(
      userService.register({
        email: "DUPLICATE@EXAMPLE.COM",
        password: "AnotherPassword123!",
        displayName: "Second User",
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "An account with this email address already exists.",
    });

    const users = await testPool.query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      ["duplicate@example.com"]
    );

    const organizations = await testPool.query(
      `SELECT id
       FROM organizations
       WHERE owner_user_id = $1`,
      [users.rows[0].id]
    );

    const tokens = await testPool.query(
      `SELECT id
       FROM auth_tokens
       WHERE user_id = $1
         AND purpose = 'email_verification'`,
      [users.rows[0].id]
    );

    expect(users.rowCount).toBe(1);
    expect(organizations.rowCount).toBe(1);
    expect(tokens.rowCount).toBe(1);
  });

  it("should roll back the entire registration if token persistence fails", async () => {
    // An invalid user ID forces the auth token foreign key to fail.
    const originalCreate = authTokenRepository.create.bind(
      authTokenRepository
    );

    const failingAuthTokenRepository = {
      ...authTokenRepository,
      create: async (
        input: Parameters<typeof authTokenRepository.create>[0],
        client?: Parameters<typeof authTokenRepository.create>[1]
      ) => {
        return originalCreate(
          {
            ...input,
            userId: "00000000-0000-4000-8000-000000000001",
          },
          client
        );
      },
    };

    const failingUserService = new UserService(
      userRepository,
      organizationRepository,
      organizationMemberRepository,
      failingAuthTokenRepository,
      transactionManager,
      passwordService,
      tokenService
    );

    await expect(
      failingUserService.register({
        email: "rollback@example.com",
        password: "StrongPassword123!",
        displayName: "Rollback User",
      })
    ).rejects.toThrow();

    const user = await userRepository.findByEmail(
      "rollback@example.com"
    );

    expect(user).toBeUndefined();

    const organizations = await testPool.query(
      `SELECT id
       FROM organizations
       WHERE name = $1`,
      ["Rollback User's Workspace"]
    );

    expect(organizations.rowCount).toBe(0);
  });
});
