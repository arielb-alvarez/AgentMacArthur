import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../src/auth/auth.service.js";

describe("AuthService", () => {
  const user = {
    id: "user-123",
    email: "test@example.com",
    displayName: "Test User",
    status: "active" as const,
    emailVerifiedAt: new Date("2026-11-15T10:00:00.000Z"),
    createdAt: new Date("2026-11-15T09:00:00.000Z"),
    updatedAt: new Date("2026-11-15T10:00:00.000Z"),
  };

  const session = {
    id: "session-123",
    userId: user.id,
    expiresAt: new Date("2026-11-22T10:00:00.000Z"),
    lastUsedAt: null as Date | null,
    revokedAt: null as Date | null,
    createdAt: new Date("2026-11-15T10:00:00.000Z"),
  };

  const generatedToken = {
    rawToken: "raw-session-token",
    tokenHash: "a".repeat(64),
  };

  const mocks = {
    findCredentialsByEmail: vi.fn(),
    findById: vi.fn(),
    verifyPassword: vi.fn(),
    generate: vi.fn(),
    hash: vi.fn(),
    createSession: vi.fn(),
    findActiveByTokenHash: vi.fn(),
    updateLastUsed: vi.fn(),
    revoke: vi.fn(),
    runInTransaction: vi.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findCredentialsByEmail.mockResolvedValue({
      user,
      passwordHash: "hashed-password",
    });

    mocks.findById.mockResolvedValue(user);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.generate.mockReturnValue(generatedToken);
    mocks.hash.mockReturnValue("hashed-token");

    mocks.createSession.mockResolvedValue(session);
    mocks.findActiveByTokenHash.mockResolvedValue(session);
    mocks.updateLastUsed.mockResolvedValue({
      ...session,
      lastUsedAt: new Date(),
    });
    mocks.revoke.mockResolvedValue({
      ...session,
      revokedAt: new Date(),
    });

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    service = new AuthService(
      {
        findCredentialsByEmail: mocks.findCredentialsByEmail,
        findById: mocks.findById,
      } as never,
      {
        create: mocks.createSession,
        findActiveByTokenHash: mocks.findActiveByTokenHash,
        updateLastUsed: mocks.updateLastUsed,
        revoke: mocks.revoke,
      } as never,
      {
        verifyPassword: mocks.verifyPassword,
      } as never,
      {
        generate: mocks.generate,
        hash: mocks.hash,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never
    );
  });

  describe("login", () => {
    it("should authenticate a user and create a session", async () => {
      const result = await service.login({
        email: "test@example.com",
        password: "StrongPassword123!",
      });

      expect(result.user).toEqual(user);
      expect(result.sessionId).toBe(session.id);
      expect(result.sessionToken).toBe(
        generatedToken.rawToken
      );
      expect(result.expiresAt).toEqual(session.expiresAt);

      expect(mocks.verifyPassword).toHaveBeenCalledWith(
        "StrongPassword123!",
        "hashed-password"
      );

      expect(mocks.generate).toHaveBeenCalledOnce();

      expect(mocks.createSession).toHaveBeenCalledWith(
        {
          userId: user.id,
          tokenHash: generatedToken.tokenHash,
          expiresAt: expect.any(Date),
        },
        expect.any(Object)
      );
    });

    it("should normalize the email address", async () => {
      await service.login({
        email: "  TEST@EXAMPLE.COM  ",
        password: "password123",
      });

      expect(
        mocks.findCredentialsByEmail
      ).toHaveBeenCalledWith("test@example.com");
    });

    it("should reject an unknown email with generic credentials error", async () => {
      mocks.findCredentialsByEmail.mockResolvedValue(undefined);

      await expect(
        service.login({
          email: "missing@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid email or password.",
      });

      expect(mocks.verifyPassword).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("should reject an incorrect password", async () => {
      mocks.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({
          email: "test@example.com",
          password: "wrong-password",
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid email or password.",
      });

      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("should reject pending accounts", async () => {
      mocks.findCredentialsByEmail.mockResolvedValue({
        user: {
          ...user,
          status: "pending",
          emailVerifiedAt: null,
        },
        passwordHash: "hashed-password",
      });

      await expect(
        service.login({
          email: "test@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Please verify your email address before logging in.",
      });

      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("should reject suspended accounts", async () => {
      mocks.findCredentialsByEmail.mockResolvedValue({
        user: {
          ...user,
          status: "suspended",
        },
        passwordHash: "hashed-password",
      });

      await expect(
        service.login({
          email: "test@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("should recheck account status before creating a session", async () => {
      mocks.findById.mockResolvedValue({
        ...user,
        status: "suspended",
      });

      await expect(
        service.login({
          email: "test@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("should not create a session when the account is no longer verified", async () => {
      mocks.findById.mockResolvedValue({
        ...user,
        emailVerifiedAt: null,
      });

      await expect(
        service.login({
          email: "test@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mocks.createSession).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("should revoke the requested session", async () => {
      await service.logout(session.id);

      expect(mocks.runInTransaction).toHaveBeenCalledWith(
        "logoutUserSession",
        expect.any(Function)
      );

      expect(mocks.revoke).toHaveBeenCalledWith(
        session.id,
        expect.any(Object)
      );
    });
  });

  describe("authenticate", () => {
    it("should authenticate a valid session", async () => {
      const result = await service.authenticate(
        generatedToken.rawToken
      );

      expect(result.user).toEqual(user);
      expect(result.session.id).toBe(session.id);

      expect(mocks.hash).toHaveBeenCalledWith(
        generatedToken.rawToken
      );

      expect(
        mocks.findActiveByTokenHash
      ).toHaveBeenCalledWith(
        "hashed-token",
        expect.any(Object)
      );

      expect(mocks.findById).toHaveBeenCalledWith(
        user.id,
        expect.any(Object)
      );

      expect(mocks.updateLastUsed).toHaveBeenCalledWith(
        session.id,
        expect.any(Object)
      );
    });

    it("should reject an empty session token", async () => {
      await expect(
        service.authenticate("")
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid or expired session.",
      });

      expect(mocks.hash).not.toHaveBeenCalled();
    });

    it("should reject an invalid or expired session", async () => {
      mocks.findActiveByTokenHash.mockResolvedValue(undefined);

      await expect(
        service.authenticate("invalid-token")
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid or expired session.",
      });

      expect(mocks.findById).not.toHaveBeenCalled();
    });

    it("should reject and revoke a session belonging to a suspended user", async () => {
      mocks.findById.mockResolvedValue({
        ...user,
        status: "suspended",
      });

      await expect(
        service.authenticate(generatedToken.rawToken)
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid or expired session.",
      });

      expect(mocks.revoke).toHaveBeenCalledWith(
        session.id,
        expect.any(Object)
      );

      expect(mocks.updateLastUsed).not.toHaveBeenCalled();
    });

    it("should reject and revoke a session belonging to an unverified user", async () => {
      mocks.findById.mockResolvedValue({
        ...user,
        emailVerifiedAt: null,
      });

      await expect(
        service.authenticate(generatedToken.rawToken)
      ).rejects.toMatchObject({
        statusCode: 401,
      });

      expect(mocks.revoke).toHaveBeenCalledWith(
        session.id,
        expect.any(Object)
      );

      expect(mocks.updateLastUsed).not.toHaveBeenCalled();
    });

    it("should reject authentication if the session becomes inactive during validation", async () => {
      mocks.updateLastUsed.mockResolvedValue(undefined);

      await expect(
        service.authenticate(generatedToken.rawToken)
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});
