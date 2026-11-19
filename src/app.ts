import express from "express";
import helmet from "helmet";
import cors from "cors";

import { env } from "./config/env.js";

import healthRouter from "./routes/health.routes.js";
import agentRouter from "./routes/agent.routes.js";
import authRouter from "./routes/auth.routes.js";
import projectRouter from "./routes/project.routes.js";
import organizationRouter from "./routes/organization.routes.js";
import { invitationRouter } from "./routes/invitation.routes.js";

import { errorMiddleware } from "./middleware/error.middleware.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware.js";
import { apiRateLimiter } from "./middleware/rate-limit.middleware.js";

import swaggerUi from "swagger-ui-express";
import { openApiSpecification } from "./docs/openapi.js";

export const createApp = () => {
  const app = express();

  const allowedOrigins = new Set(env.CORS_ORIGINS);

  // Security headers.
  app.use(helmet());

  // CORS: allow configured frontend origins and requests without Origin.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
      ],
      credentials: true,
      maxAge: 600,
    })
  );

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Limit incoming JSON payloads to 1 MB.
  app.use(express.json({ limit: "1mb" }));

  // API documentation.
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpecification)
  );

  app.use("/health", healthRouter);

  app.use("/api", apiRateLimiter);

  app.use("/api/auth", authRouter);

  app.use("/api/projects", projectRouter);

  app.use("/api/organizations", organizationRouter);

  app.use("/api", invitationRouter);

  app.use("/api/agent", agentRouter);

  app.use(errorMiddleware);

  return app;
};

// Preserve the existing default import used by server.ts and integration tests.
const app = createApp();

export default app;
