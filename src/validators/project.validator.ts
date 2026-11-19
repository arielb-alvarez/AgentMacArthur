import { z } from "zod";

const projectStatusSchema = z.enum([
  "draft",
  "active",
  "on_hold",
  "completed",
  "archived",
]);

export const createProjectSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID."),

    name: z
      .string()
      .trim()
      .min(1, "Project name is required.")
      .max(150, "Project name cannot exceed 150 characters."),

    description: z
      .string()
      .trim()
      .max(10_000, "Description cannot exceed 10,000 characters.")
      .nullable()
      .optional(),
  })
  .strict();

export const listProjectsQuerySchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Organization ID must be a valid UUID.")
      .optional(),
  })
  .strict();

export const projectIdParamsSchema = z
  .object({
    projectId: z
      .string()
      .uuid("Project ID must be a valid UUID."),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty.")
      .max(150, "Project name cannot exceed 150 characters.")
      .optional(),

    description: z
      .string()
      .trim()
      .max(10_000, "Description cannot exceed 10,000 characters.")
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined,
    {
      message: "At least one project field must be provided.",
    }
  );

export const updateProjectStatusSchema = z
  .object({
    status: projectStatusSchema,
  })
  .strict();

const manageableProjectMemberRoleSchema = z.enum([
  "client",
  "stakeholder",
  "project_manager",
  "technical_lead",
  "developer",
  "qa_engineer",
  "viewer",
]);

const projectMemberStatusSchema = z.enum([
  "active",
  "suspended",
]);

export const projectMemberParamsSchema = z
  .object({
    projectId: z
      .string()
      .uuid("Project ID must be a valid UUID."),
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
  })
  .strict();

export const projectMemberCustomRoleParamsSchema = z
  .object({
    projectId: z
      .string()
      .uuid("Project ID must be a valid UUID."),
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
    roleId: z
      .string()
      .uuid("Role ID must be a valid UUID."),
  })
  .strict();

export const addProjectMemberSchema = z
  .object({
    userId: z
      .string()
      .uuid("User ID must be a valid UUID."),
    role: manageableProjectMemberRoleSchema,
  })
  .strict();

export const updateProjectMemberRoleSchema = z
  .object({
    role: manageableProjectMemberRoleSchema,
  })
  .strict();

export const updateProjectMemberStatusSchema = z
  .object({
    status: projectMemberStatusSchema,
  })
  .strict();

export const transferProjectOwnershipSchema = z
  .object({
    newOwnerUserId: z
      .string()
      .uuid("New owner user ID must be a valid UUID."),
  })
  .strict();
