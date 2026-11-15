import { describe, it, expect, beforeEach } from "vitest";

import { PasswordService } from "../../src/auth/password.service.js";

describe("PasswordService", () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  describe("hashPassword", () => {
    it("should generate a password hash", async () => {
      const hash = await passwordService.hashPassword(
        "SecurePassword123!"
      );

      expect(hash).toMatch(
        /^scrypt\$v1\$16384\$8\$1\$/
      );
    });

    it("should generate different hashes for the same password", async () => {
      const password = "SecurePassword123!";

      const firstHash =
        await passwordService.hashPassword(password);

      const secondHash =
        await passwordService.hashPassword(password);

      expect(firstHash).not.toBe(secondHash);
    });

    it("should reject an empty password", async () => {
      await expect(
        passwordService.hashPassword("")
      ).rejects.toThrow("Password must not be empty.");
    });
  });

  describe("verifyPassword", () => {
    it("should verify the correct password", async () => {
      const password = "SecurePassword123!";

      const hash =
        await passwordService.hashPassword(password);

      const result = await passwordService.verifyPassword(
        password,
        hash
      );

      expect(result).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const hash = await passwordService.hashPassword(
        "SecurePassword123!"
      );

      const result = await passwordService.verifyPassword(
        "WrongPassword123!",
        hash
      );

      expect(result).toBe(false);
    });

    it("should verify passwords containing Unicode characters", async () => {
      const password = "Pässwörd-安全-🔐";

      const hash =
        await passwordService.hashPassword(password);

      const result = await passwordService.verifyPassword(
        password,
        hash
      );

      expect(result).toBe(true);
    });

    it("should return false for an empty password", async () => {
      const hash = await passwordService.hashPassword(
        "SecurePassword123!"
      );

      const result = await passwordService.verifyPassword(
        "",
        hash
      );

      expect(result).toBe(false);
    });

    it.each([
      "",
      "invalid-hash",
      "bcrypt$some-hash",
      "scrypt$v2$16384$8$1$salt$hash",
      "scrypt$v1$16384$8$1$invalid$hash",
    ])("should reject a malformed password hash: %s", async (hash) => {
      const result = await passwordService.verifyPassword(
        "SecurePassword123!",
        hash
      );

      expect(result).toBe(false);
    });
  });
});
