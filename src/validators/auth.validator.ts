import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email address is required.")
  .max(255, "Email address cannot exceed 255 characters.")
  .pipe(z.email("Please provide a valid email address."));

export const registerSchema = z
  .object({
    email: emailSchema,

    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password cannot exceed 128 characters."),

    displayName: z
      .string()
      .trim()
      .min(2, "Display name must be at least 2 characters.")
      .max(100, "Display name cannot exceed 100 characters."),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,

    password: z
      .string()
      .min(1, "Password is required.")
      .max(128, "Password cannot exceed 128 characters."),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .min(1, "Verification token is required.")
      .max(256, "Verification token is invalid."),
  })
  .strict();
