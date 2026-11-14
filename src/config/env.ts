import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z.string().trim().min(1).optional()
);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3000),

    OPENAI_API_KEY: optionalTrimmedString,

    OPENAI_MODEL: z.string().trim().min(1).default("gpt-4.1-mini"),

    AGENT_PROVIDER: z.enum(["mock", "openai"]).default("mock"),

    CORS_ORIGINS: z
      .string()
      .default("http://localhost:4200,http://localhost:5173")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      ),

    DB_HOST: z.string().trim().min(1).default("localhost"),

    DB_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(5432),

    DB_USER: z.string().trim().min(1).default("postgres"),

    DB_PASSWORD: z.string().min(1, "Database password is required"),

    DB_NAME: z.string().trim().min(1).default("agentmacarthur"),

    DB_TEST_NAME: z
      .string()
      .trim()
      .min(1)
      .default("agentmacarthur_test"),

    // PostgreSQL connection pool configuration.
    DB_POOL_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),

    DB_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(600000)
      .default(30000),

    DB_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(60000)
      .default(5000),

    DB_QUERY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1)
      .max(300000)
      .default(30000),
  })
  .superRefine((config, ctx) => {
    if (config.AGENT_PROVIDER === "openai") {
      if (!config.OPENAI_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENAI_API_KEY"],
          message: "OPENAI_API_KEY is required when AGENT_PROVIDER is openai.",
        });
      } else if (
        /^(your_api_key_here|your_openai_api_key_here|placeholder)$/i.test(
          config.OPENAI_API_KEY
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["OPENAI_API_KEY"],
          message: "A valid OpenAI API key must be provided.",
        });
      }
    }

    if (config.DB_NAME === config.DB_TEST_NAME) {
      ctx.addIssue({
        code: "custom",
        path: ["DB_TEST_NAME"],
        message: "DB_TEST_NAME must be different from DB_NAME.",
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => {
      const variable = issue.path.join(".") || "ENVIRONMENT";
      return `- ${variable}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = result.data;
