import pg from "pg";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,

  // Connection pool configuration.
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
});

// Handle unexpected errors from idle pool clients.
pool.on("error", (error) => {
  logger.error("Unexpected PostgreSQL pool error", error);
});

export const getDatabasePoolMetrics = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
});

export const logDatabasePoolMetrics = (): void => {
  const metrics = getDatabasePoolMetrics();

  const activeCount = metrics.totalCount - metrics.idleCount;

  const utilizationPercent = Number(
    ((activeCount / env.DB_POOL_MAX) * 100).toFixed(2)
  );

  const context = {
    ...metrics,
    activeCount,
    maxConnections: env.DB_POOL_MAX,
    utilizationPercent,
  };

  if (utilizationPercent >= 100 || metrics.waitingCount > 0) {
    logger.error("Database connection pool is saturated", context);
    return;
  }

  if (utilizationPercent >= 80) {
    logger.warn("Database connection pool utilization is high", context);
    return;
  }

  logger.info("Database connection pool metrics", context);
};

export const startDatabasePoolMonitoring = (
  intervalMs = 60_000
): (() => void) => {
  const interval = setInterval(() => {
    logDatabasePoolMetrics();
  }, intervalMs);

  interval.unref();

  logger.info("Database pool monitoring started", {
    intervalMs,
  });

  return () => {
    clearInterval(interval);

    logger.info("Database pool monitoring stopped");
  };
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Database health check failed", error);
    return false;
  }
};

export const connectDatabase = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");

    logger.info("PostgreSQL database connected successfully");
  } finally {
    client.release();
  }
};
