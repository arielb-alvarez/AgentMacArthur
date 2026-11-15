import { z } from "zod";

export const organizationIdParamsSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),
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
