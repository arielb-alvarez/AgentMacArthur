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
import { AuthService } from "../../src/auth/auth.service.js";
import { EmailVerificationService } from "../../src/auth/email-verification.service.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresAuthTokenRepository } from "../../src/auth-tokens/postgres-auth-token.repository.js";
import { PostgresSessionRepository } from "../../src/sessions/postgres-session.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";

import { UserService } from "../../src/users/user.service.js";

describe("AuthService integration", () => {
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

  const sessionRepository = new PostgresSessionRepository(
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

  const emailVerificationService = new EmailVerificationService(
    userRepository,
    authTokenRepository,
    transactionManager,
    tokenService
  );

  const authService = new AuthService(
    userRepository,
    sessionRepository,
    passwordService,
    tokenService,
    transactionManager
  );

  const registerAndVerifyUser = async (
    email = "alex@example.com"
  ) => {
    const registration = await userService.register({
      email,
      password: "StrongPassword123!",
      displayName: "Alex Morgan",
    });

    await emailVerificationService.verify(
      registration.verificationToken
    );

    return registration;
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

  it("should reject login before email verification", async () => {
    await userService.register({
      email: "pending@example.com",
      password: "StrongPassword123!",
      displayName: "Pending User",
    });

    await expect(
      authService.login({
        email: "pending@example.com",
        password: "StrongPassword123!",
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Please verify your email address before logging in.",
    });
  });

  it("should reject login with an incorrect password", async () => {
    await registerAndVerifyUser();

    await expect(
      authService.login({
        email: "alex@example.com",
        password: "WrongPassword123!",
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });
  });

  it("should create a session after successful login", async () => {
    const registration = await registerAndVerifyUser();

    const result = await authService.login({
      email: "alex@example.com",
      password: "StrongPassword123!",
    });

    expect(result.user.id).toBe(registration.user.id);
    expect(result.user.status).toBe("active");
    expect(result.sessionId).toBeDefined();
    expect(result.sessionToken).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const tokenHash = tokenService.hash(result.sessionToken);

    const storedSession =
      await sessionRepository.findActiveByTokenHash(tokenHash);

    expect(storedSession).toBeDefined();
    expect(storedSession?.userId).toBe(registration.user.id);
    expect(storedSession?.id).toBe(result.sessionId);
  });

  it("should authenticate a valid session token", async () => {
    const registration = await registerAndVerifyUser();

    const login = await authService.login({
      email: "alex@example.com",
      password: "StrongPassword123!",
    });

    const authenticated = await authService.authenticate(
      login.sessionToken
    );

    expect(authenticated.user.id).toBe(registration.user.id);
    expect(authenticated.session.id).toBe(login.sessionId);
    expect(authenticated.session.lastUsedAt).toBeInstanceOf(Date);
  });

  it("should reject an invalid session token", async () => {
    await registerAndVerifyUser();

    await expect(
      authService.authenticate("invalid-session-token")
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or expired session.",
    });
  });

  it("should reject an expired session token", async () => {
    await registerAndVerifyUser();

    const login = await authService.login({
      email: "alex@example.com",
      password: "StrongPassword123!",
    });

    await testPool.query(
      `UPDATE sessions
      SET created_at = NOW() - INTERVAL '2 days',
          expires_at = NOW() - INTERVAL '1 minute'
      WHERE id = $1`,
      [login.sessionId]
    );

    await expect(
      authService.authenticate(login.sessionToken)
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("should revoke the session during logout", async () => {
    await registerAndVerifyUser();

    const login = await authService.login({
      email: "alex@example.com",
      password: "StrongPassword123!",
    });

    await authService.logout(login.sessionId);

    const tokenHash = tokenService.hash(login.sessionToken);

    const activeSession =
      await sessionRepository.findActiveByTokenHash(tokenHash);

    expect(activeSession).toBeUndefined();

    await expect(
      authService.authenticate(login.sessionToken)
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("should reject and revoke an existing session after account suspension", async () => {
    const registration = await registerAndVerifyUser();

    const login = await authService.login({
      email: "alex@example.com",
      password: "StrongPassword123!",
    });

    await userRepository.updateStatus(
      registration.user.id,
      "suspended"
    );

    await expect(
      authService.authenticate(login.sessionToken)
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    const tokenHash = tokenService.hash(login.sessionToken);

    const activeSession =
      await sessionRepository.findActiveByTokenHash(tokenHash);

    expect(activeSession).toBeUndefined();
  });
});
