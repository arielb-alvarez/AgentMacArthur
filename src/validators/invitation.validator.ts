import { z } from "zod";

export const organizationInvitationParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
  })
  .strict();

export const invitationParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),

    invitationId: z
      .string()
      .uuid("Invitation ID must be a valid UUID."),
  })
  .strict();

export const createInvitationSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("A valid email address is required.")
      .max(254, "Email address cannot exceed 254 characters."),

    roleKey: z
      .enum(["admin", "member"])
      .optional(),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .min(1, "Invitation token is required.")
      .max(256, "Invitation token is invalid."),
  })
  .strict();
