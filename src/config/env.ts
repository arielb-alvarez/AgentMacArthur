import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

  OPENAI_API_KEY: z.string().optional(),

  OPENAI_MODEL: z
    .string()
    .default("gpt-4.1-mini"),
});

export const env = envSchema.parse(process.env);