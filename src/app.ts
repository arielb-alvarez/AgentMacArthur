import express from "express";
import healthRouter from "./routes/health.routes.js";
import agentRouter from "./routes/agent.routes.js";
import { errorMiddleware  } from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/agent", agentRouter);
app.use(errorMiddleware);

export default app;