import { Router } from "express";
import { env } from "../config/env.js";
import { checkDatabaseHealth } from "../config/database.js";

const router = Router();

// Liveness: confirms the application process is running.
router.get("/live", (_req, res) => {
  res.status(200).json({
    success: true,
    application: "AgentMacArthur",
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

// Readiness: confirms the application can serve requests.
router.get("/ready", async (_req, res) => {
  const databaseHealthy = await checkDatabaseHealth();

  const isReady = databaseHealthy;

  res.status(isReady ? 200 : 503).json({
    success: isReady,
    application: "AgentMacArthur",
    status: isReady ? "ready" : "not_ready",
    environment: env.NODE_ENV,
    checks: {
      database: databaseHealthy ? "healthy" : "unhealthy",
    },
    timestamp: new Date().toISOString(),
  });
});

// Keep the original endpoint for backward compatibility.
router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    application: "AgentMacArthur",
    status: "healthy",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;