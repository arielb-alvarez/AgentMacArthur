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

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  logger.error("Unexpected PostgreSQL pool error", error);
});

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
