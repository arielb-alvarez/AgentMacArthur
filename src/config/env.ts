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

  AGENT_PROVIDER: z.enum(["mock", "openai"]).default("mock"),

  DB_HOST: z.string().default("localhost"),

  DB_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(5432),

  DB_USER: z.string().default("postgres"),

  DB_PASSWORD: z.string().min(1, "Database password is required"),

  DB_NAME: z.string().default("agentmacarthur"),

  DB_TEST_NAME: z.string().default("agentmacarthur_test"),
});

export const env = envSchema.parse(process.env);