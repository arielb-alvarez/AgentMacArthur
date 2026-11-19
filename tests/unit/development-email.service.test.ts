import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DevelopmentEmailService } from "../../src/email/development-email.service.js";
import { logger } from "../../src/utils/logger.js";

describe("DevelopmentEmailService", () => {
  let service: DevelopmentEmailService;

  const email = {
    to: "test@example.com",
    displayName: "Test User",
    verificationUrl:
      "http://localhost:4200/verify-email?token=test-token",
    expiresAt: new Date("2026-11-16T10:00:00.000Z"),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    service = new DevelopmentEmailService("development");
  });

  it("should log verification email metadata without exposing the URL", async () => {
    const loggerSpy = vi.spyOn(logger, "info");

    await service.sendVerificationEmail(email);

    expect(loggerSpy).toHaveBeenCalledWith(
      "Development verification email generated",
      {
        to: email.to,
        displayName: email.displayName,
        expiresAt: email.expiresAt,
      }
    );

    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(
      email.verificationUrl
    );
  });

  it("should log only once when generating a verification email", async () => {
    const loggerSpy = vi.spyOn(logger, "info");

    await service.sendVerificationEmail(email);

    expect(loggerSpy).toHaveBeenCalledTimes(1);
  });

  it("should reject production environment initialization", () => {
    expect(
      () => new DevelopmentEmailService("production")
    ).toThrow(
      "DevelopmentEmailService cannot be used in production."
    );
  });

  it("should allow test environment initialization", () => {
    expect(
      () => new DevelopmentEmailService("test")
    ).not.toThrow();
  });
});
