
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, pool } from "./config/database.js";
import { logger } from "./utils/logger.js";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      logger.info(`AgentMacArthur running on port ${env.PORT}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          await pool.end();
          logger.info("Database connections closed");
          process.exit(0);
        } catch (error) {
          logger.error("Error during database shutdown", error);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start AgentMacArthur", error);
    await pool.end();
    process.exit(1);
  }
};

void startServer();
