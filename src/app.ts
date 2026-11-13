import express from "express";
import healthRouter from "./routes/health.routes.js";
import agentRouter from "./routes/agent.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware.js";
import { apiRateLimiter } from "./middleware/rate-limit.middleware.js";

const app = express();

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(express.json());

app.use("/health", healthRouter);

// Apply general rate limiting to all API routes.
app.use("/api", apiRateLimiter);

app.use("/api/agent", agentRouter);

app.use(errorMiddleware);

export default app;