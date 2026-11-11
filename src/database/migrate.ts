
import { pool } from "../config/database.js";
import { logger } from "../utils/logger.js";
import { runMigrations } from "./migration.runner.js";

const migrate = async (): Promise<void> => {
  try {
    await runMigrations();

    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.error("Database migrations failed", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

void migrate();
