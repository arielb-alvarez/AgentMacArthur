import { describe, expect, it } from "vitest";

import {
  loginSchema,
  registerSchema,
  verifyEmailSchema,
} from "../../src/validators/auth.validator.js";

describe("Authentication validators", () => {
  describe("registerSchema", () => {
    const validInput = {
      email: "user@example.com",
      password: "StrongPassword123!",
      displayName: "Test User",
    };

    it("accepts valid registration input", () => {
      expect(registerSchema.safeParse(validInput).success).toBe(true);
    });

    it("normalizes email addresses", () => {
      const result = registerSchema.safeParse({
        ...validInput,
        email: "  USER@EXAMPLE.COM  ",
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("rejects invalid email addresses", () => {
      expect(
        registerSchema.safeParse({
          ...validInput,
          email: "invalid-email",
        }).success
      ).toBe(false);
    });

    it("rejects passwords shorter than eight characters", () => {
      expect(
        registerSchema.safeParse({
          ...validInput,
          password: "short",
        }).success
      ).toBe(false);
    });

    it("rejects passwords longer than 128 characters", () => {
      expect(
        registerSchema.safeParse({
          ...validInput,
          password: "a".repeat(129),
        }).success
      ).toBe(false);
    });

    it("rejects display names shorter than two characters", () => {
      expect(
        registerSchema.safeParse({
          ...validInput,
          displayName: "A",
        }).success
      ).toBe(false);
    });

    it("rejects unexpected properties", () => {
      expect(
        registerSchema.safeParse({
          ...validInput,
          role: "admin",
        }).success
      ).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("accepts valid login input", () => {
      expect(
        loginSchema.safeParse({
          email: "user@example.com",
          password: "password123",
        }).success
      ).toBe(true);
    });

    it("accepts passwords shorter than the registration minimum", () => {
      expect(
        loginSchema.safeParse({
          email: "user@example.com",
          password: "short",
        }).success
      ).toBe(true);
    });

    it("rejects empty passwords", () => {
      expect(
        loginSchema.safeParse({
          email: "user@example.com",
          password: "",
        }).success
      ).toBe(false);
    });

    it("rejects unexpected properties", () => {
      expect(
        loginSchema.safeParse({
          email: "user@example.com",
          password: "password123",
          admin: true,
        }).success
      ).toBe(false);
    });
  });

  describe("verifyEmailSchema", () => {
    it("accepts a valid verification token", () => {
      expect(
        verifyEmailSchema.safeParse({
          token: "valid-verification-token",
        }).success
      ).toBe(true);
    });

    it("rejects an empty verification token", () => {
      expect(
        verifyEmailSchema.safeParse({
          token: "",
        }).success
      ).toBe(false);
    });

    it("rejects unexpected properties", () => {
      expect(
        verifyEmailSchema.safeParse({
          token: "valid-token",
          userId: "user-123",
        }).success
      ).toBe(false);
    });
  });
});
