import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/errors/app.error.js";
import { EmailVerificationService } from "../../src/auth/email-verification.service.js";

describe("EmailVerificationService", () => {
  const user = {
    id: "user-123",
    email: "test@example.com",
    displayName: "Test User",
    status: "active" as const,
    emailVerifiedAt: new Date("2026-11-15T10:00:00.000Z"),
    createdAt: new Date("2026-11-15T09:00:00.000Z"),
    updatedAt: new Date("2026-11-15T10:00:00.000Z"),
  };

  const token = {
    id: "token-123",
    userId: "user-123",
    purpose: "email_verification" as const,
    expiresAt: new Date("2026-11-16T10:00:00.000Z"),
    consumedAt: null,
    createdAt: new Date("2026-11-15T09:00:00.000Z"),
  };

  const mocks = {
    findActiveByTokenHash: vi.fn(),
    consume: vi.fn(),
    verifyEmail: vi.fn(),
    runInTransaction: vi.fn(),
    hash: vi.fn(),
  };

  let service: EmailVerificationService;

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.hash.mockReturnValue("hashed-token");
    mocks.findActiveByTokenHash.mockResolvedValue(token);
    mocks.consume.mockResolvedValue({
      ...token,
      consumedAt: new Date(),
    });
    mocks.verifyEmail.mockResolvedValue(user);

    mocks.runInTransaction.mockImplementation(
      async (
        _operationName: string,
        operation: (client: object) => Promise<unknown>
      ) => operation({})
    );

    service = new EmailVerificationService(
      {
        verifyEmail: mocks.verifyEmail,
      } as never,
      {
        findActiveByTokenHash: mocks.findActiveByTokenHash,
        consume: mocks.consume,
      } as never,
      {
        runInTransaction: mocks.runInTransaction,
      } as never,
      {
        hash: mocks.hash,
      } as never
    );
  });

  it("should verify the token and activate the user", async () => {
    const result = await service.verify("raw-token");

    expect(result).toEqual(user);

    expect(mocks.hash).toHaveBeenCalledWith("raw-token");

    expect(mocks.runInTransaction).toHaveBeenCalledWith(
      "verifyUserEmail",
      expect.any(Function)
    );

    expect(mocks.findActiveByTokenHash).toHaveBeenCalledWith(
      "hashed-token",
      "email_verification",
      expect.any(Object)
    );

    expect(mocks.consume).toHaveBeenCalledWith(
      token.id,
      expect.any(Object)
    );

    expect(mocks.verifyEmail).toHaveBeenCalledWith(
      token.userId,
      expect.any(Object)
    );
  });

  it("should reject an empty token", async () => {
    await expect(service.verify("")).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired verification token.",
    });

    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.runInTransaction).not.toHaveBeenCalled();
  });

  it("should reject an unknown or expired token", async () => {
    mocks.findActiveByTokenHash.mockResolvedValue(undefined);

    await expect(
      service.verify("invalid-token")
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired verification token.",
    });

    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("should reject a token that cannot be consumed", async () => {
    mocks.consume.mockResolvedValue(undefined);

    await expect(
      service.verify("already-used-token")
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired verification token.",
    });

    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("should reject activation when the account cannot be verified", async () => {
    mocks.verifyEmail.mockResolvedValue(undefined);

    await expect(
      service.verify("raw-token")
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "This account cannot be activated.",
    });
  });

  it("should propagate transaction failures", async () => {
    const databaseError = new Error("Database unavailable");

    mocks.runInTransaction.mockRejectedValue(databaseError);

    await expect(
      service.verify("raw-token")
    ).rejects.toBe(databaseError);
  });

  it("should not consume or activate an account if token lookup fails", async () => {
    const lookupError = new Error("Token lookup failed");

    mocks.findActiveByTokenHash.mockRejectedValue(lookupError);

    await expect(
      service.verify("raw-token")
    ).rejects.toBe(lookupError);

    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
});
