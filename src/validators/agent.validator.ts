import { z } from "zod";

const messageSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(10_000, "Message cannot exceed 10,000 characters.");

const conversationIdSchema = z
  .string()
  .uuid("Conversation ID must be a valid UUID.");

const organizationIdSchema = z
  .string()
  .uuid("Organization ID must be a valid UUID.");

const projectIdSchema = z
  .string()
  .uuid("Project ID must be a valid UUID.");

export const chatSchema = z.union([
  // Continue an existing conversation.
  z
    .object({
      message: messageSchema,
      conversationId: conversationIdSchema,
    })
    .strict(),

  // Create a personal conversation.
  z
    .object({
      message: messageSchema,
      scope: z.literal("personal"),
    })
    .strict(),

  // Create an organization conversation.
  z
    .object({
      message: messageSchema,
      scope: z.literal("organization"),
      organizationId: organizationIdSchema,
    })
    .strict(),

  // Create a project conversation.
  z
    .object({
      message: messageSchema,
      scope: z.literal("project"),
      organizationId: organizationIdSchema,
      projectId: projectIdSchema,
    })
    .strict(),
]);
