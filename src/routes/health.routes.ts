import { Router } from "express";
import { env } from "../config/env.js";
import { checkDatabaseHealth } from "../config/database.js";

const router = Router();

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check application liveness
 *     description: Confirms that the application process is running.
 *     responses:
 *       200:
 *         description: Application is alive.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get("/live", (_req, res) => {
  res.status(200).json({
    success: true,
    application: "AgentMacArthur",
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check application readiness
 *     description: Checks whether the application can serve requests by verifying database connectivity.
 *     responses:
 *       200:
 *         description: Application and database are ready.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *       503:
 *         description: Database is unavailable and the application is not ready.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 */
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

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check application health
 *     description: Backward-compatible health endpoint.
 *     responses:
 *       200:
 *         description: Application is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
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