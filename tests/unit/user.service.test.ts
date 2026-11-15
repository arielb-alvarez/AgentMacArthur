import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/errors/app.error.js";
import { UserService } from "../../src/users/user.service.js";

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  generateToken: vi.fn(),
  runInTransaction: vi.fn(),
  createUser: vi.fn(),
  createOrganization: vi.fn(),
  createOrganizationMember: vi.fn(),
  createAuthToken: vi.fn(),
}));

vi.mock("../../src/auth/password.service.js", () => ({
  PasswordService: class {
    hashPassword = mocks.hashPassword;
  },
}));

vi.mock("../../src/auth/token.service.js", () => ({
  TokenService: class {
    generate = mocks.generateToken;
  },
}));

describe("UserService", () => {
  let service: UserService;

  const user = {
    id: "user-123",
    email: "test@example.com",
    displayName: "Test User",
    status: "pending" as const,
    emailVerifiedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const organization = {
    id: "org-123",
    name: "Test User's Workspace",
    slug: "personal-test",
    type: "personal" as const,
    ownerUserId: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const generatedToken = {
    rawToken: "raw-verification-token",
    tokenHash: "a".repeat(64),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.generateToken.mockReturnValue(generatedToken);

    mocks.createUser.mockResolvedValue(user);
    mocks.createOrganization.mockResolvedValue(organization);
    mocks.createOrganizationMember.mockResolvedValue({});
    mocks.createAuthToken.mockResolvedValue({});

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    service = new UserService(
      { create: mocks.createUser } as never,
      { create: mocks.createOrganization } as never,
      { create: mocks.createOrganizationMember } as never,
      { create: mocks.createAuthToken } as never,
      { runInTransaction: mocks.runInTransaction } as never,
      { hashPassword: mocks.hashPassword } as never,
      { generate: mocks.generateToken } as never
    );
  });

  it("should register a user and create their personal workspace", async () => {
    const result = await service.register({
      email: " TEST@EXAMPLE.COM ",
      password: "StrongPassword123!",
      displayName: "Test User",
    });

    expect(result.user).toEqual(user);
    expect(result.verificationToken).toBe(
      generatedToken.rawToken
    );

    expect(mocks.hashPassword).toHaveBeenCalledWith(
      "StrongPassword123!"
    );

    expect(mocks.createUser).toHaveBeenCalledWith(
      {
        email: "test@example.com",
        passwordHash: "hashed-password",
        displayName: "Test User",
      },
      expect.any(Object)
    );

    expect(mocks.createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test User's Workspace",
        type: "personal",
        ownerUserId: user.id,
      }),
      expect.any(Object)
    );

    expect(mocks.createOrganizationMember).toHaveBeenCalledWith(
      {
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
        status: "active",
      },
      expect.any(Object)
    );

    expect(mocks.createAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: "email_verification",
        tokenHash: generatedToken.tokenHash,
        expiresAt: expect.any(Date),
      }),
      expect.any(Object)
    );
  });

  it("should normalize the email address", async () => {
    await service.register({
      email: "  USER@EXAMPLE.COM ",
      password: "password123",
      displayName: "Test User",
    });

    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
      }),
      expect.any(Object)
    );
  });

  it("should hash the password before starting the transaction", async () => {
    const executionOrder: string[] = [];

    mocks.hashPassword.mockImplementation(async () => {
      executionOrder.push("hash");
      return "hashed-password";
    });

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => {
        executionOrder.push("transaction");
        return operation({});
      }
    );

    await service.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });

    expect(executionOrder).toEqual(["hash", "transaction"]);
  });

  it("should convert duplicate email errors into a conflict error", async () => {
    const duplicateError = Object.assign(
      new Error("Duplicate email"),
      {
        code: "23505",
        constraint: "idx_users_email_unique",
      }
    );

    mocks.runInTransaction.mockRejectedValue(duplicateError);

    await expect(
      service.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      })
    ).rejects.toMatchObject({
      message: "An account with this email address already exists.",
      statusCode: 409,
    });
  });

  it("should propagate unexpected database errors", async () => {
    const databaseError = new Error("Database unavailable");

    mocks.runInTransaction.mockRejectedValue(databaseError);

    await expect(
      service.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      })
    ).rejects.toBe(databaseError);
  });

  it("should not return a successful registration when the transaction fails", async () => {
    mocks.createAuthToken.mockRejectedValue(
      new Error("Token persistence failed")
    );

    await expect(
      service.register({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      })
    ).rejects.toThrow("Token persistence failed");
  });
});
