import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/errors/app.error.js";
import { RegistrationService } from "../../src/auth/registration.service.js";
import { logger } from "../../src/utils/logger.js";

describe("RegistrationService", () => {
  const user = {
    id: "user-123",
    email: "test@example.com",
    displayName: "Test User",
    status: "pending" as const,
    emailVerifiedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const expiresAt = new Date("2026-11-16T10:00:00.000Z");

  const registrationResult = {
    user,
    verificationToken: "raw-verification-token",
    expiresAt,
  };

  const registerUser = vi.fn();
  const sendVerificationEmail = vi.fn();

  let service: RegistrationService;

  beforeEach(() => {
    vi.clearAllMocks();

    registerUser.mockResolvedValue(registrationResult);
    sendVerificationEmail.mockResolvedValue(undefined);

    service = new RegistrationService(
      { register: registerUser } as never,
      { sendVerificationEmail } as never,
      "http://localhost:4200"
    );
  });

  it("should register the user and send a verification email", async () => {
    const result = await service.register({
      email: "test@example.com",
      password: "StrongPassword123!",
      displayName: "Test User",
    });

    expect(registerUser).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "StrongPassword123!",
      displayName: "Test User",
    });

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

    expect(sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        displayName: user.displayName,
        expiresAt,
      })
    );

    expect(result).toEqual({ user });
  });

  it("should put the verification token in the URL fragment", async () => {
    await service.register({
      email: user.email,
      password: "StrongPassword123!",
      displayName: user.displayName,
    });

    const emailArgument = sendVerificationEmail.mock.calls[0][0];

    const verificationUrl = new URL(
      emailArgument.verificationUrl
    );

    expect(verificationUrl.origin).toBe(
      "http://localhost:4200"
    );

    expect(verificationUrl.pathname).toBe("/verify-email");

    expect(verificationUrl.search).toBe("");

    expect(
      new URLSearchParams(
        verificationUrl.hash.slice(1)
      ).get("token")
    ).toBe(registrationResult.verificationToken);
  });

  it("should not expose the raw verification token in the result", async () => {
    const result = await service.register({
      email: user.email,
      password: "StrongPassword123!",
      displayName: user.displayName,
    });

    expect(result).toEqual({ user });

    expect(result).not.toHaveProperty("verificationToken");

    expect(JSON.stringify(result)).not.toContain(
      registrationResult.verificationToken
    );
  });

  it("should propagate user registration errors without sending email", async () => {
    const duplicateError = new AppError(
      "An account with this email address already exists.",
      409
    );

    registerUser.mockRejectedValue(duplicateError);

    await expect(
      service.register({
        email: user.email,
        password: "StrongPassword123!",
        displayName: user.displayName,
      })
    ).rejects.toBe(duplicateError);

    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("should return a 503 error when email delivery fails", async () => {
    const loggerSpy = vi.spyOn(logger, "error");

    sendVerificationEmail.mockRejectedValue(
      new Error("SMTP unavailable")
    );

    await expect(
      service.register({
        email: user.email,
        password: "StrongPassword123!",
        displayName: user.displayName,
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      message:
        "Your account was created, but the verification email could not be sent. Please request a new verification email.",
    });

    expect(registerUser).toHaveBeenCalledTimes(1);

    expect(loggerSpy).toHaveBeenCalledWith(
      "Registration verification email delivery failed",
      { errorName: "Error" }
    );
  });

  it("should not send an email if user registration fails", async () => {
    registerUser.mockRejectedValue(
      new Error("Database unavailable")
    );

    await expect(
      service.register({
        email: user.email,
        password: "StrongPassword123!",
        displayName: user.displayName,
      })
    ).rejects.toThrow("Database unavailable");

    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
