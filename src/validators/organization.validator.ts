import { z } from "zod";

export const organizationIdParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
  })
  .strict();

export const organizationMemberParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
  })
  .strict();

export const organizationRoleParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
    roleId: z
      .string()
      .uuid("Role ID must be a valid UUID."),
  })
  .strict();

export const organizationMemberRoleParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
    roleId: z
      .string()
      .uuid("Role ID must be a valid UUID."),
  })
  .strict();

export const updateOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Organization name cannot be empty.")
      .max(150, "Organization name cannot exceed 150 characters.")
      .optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined,
    {
      message: "At least one organization field must be provided.",
    }
  );

export const transferOrganizationOwnershipSchema = z
  .object({
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
  })
  .strict();

export const updateOrganizationMemberStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
  })
  .strict();

export const updateOrganizationMemberRoleSchema = z
  .object({
    role: z.enum(["admin", "member"]),
  })
  .strict();

export const createCustomRoleSchema = z
  .object({
    scope: z.enum(["organization", "project"]),
    key: z
      .string()
      .trim()
      .min(1, "Role key cannot be empty.")
      .max(100, "Role key cannot exceed 100 characters.")
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Role key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores."
      ),
    name: z
      .string()
      .trim()
      .min(1, "Role name cannot be empty.")
      .max(100, "Role name cannot exceed 100 characters."),
    description: z
      .string()
      .trim()
      .max(500, "Role description cannot exceed 500 characters.")
      .nullable()
      .optional(),
  })
  .strict();

export const updateCustomRoleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Role name cannot be empty.")
      .max(100, "Role name cannot exceed 100 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Role description cannot exceed 500 characters.")
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined,
    {
      message: "At least one custom role field must be provided.",
    }
  );

export const replaceRolePermissionsSchema = z
  .object({
    permissionIds: z
      .array(
        z.string().uuid("Permission ID must be a valid UUID.")
      )
      .max(200, "A maximum of 200 permissions can be assigned at once."),
  })
  .strict();

export const organizationRoleScopeQuerySchema = z
  .object({
    scope: z.enum(["organization", "project"]).optional(),
  })
  .strict();

export const organizationPermissionScopeQuerySchema = z
  .object({
    scope: z.enum(["organization", "project"]),
  })
  .strict();
