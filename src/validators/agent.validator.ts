import { z } from "zod";

export const chatSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message cannot be empty.")
      .max(10_000, "Message cannot exceed 10,000 characters."),

    conversationId: z
      .string()
      .uuid("Conversation ID must be a valid UUID.")
      .optional(),
  })
  .strict();
