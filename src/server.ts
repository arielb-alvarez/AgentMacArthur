import type { Server } from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  logDatabasePoolMetrics,
  pool,
  startDatabasePoolMonitoring,
} from "./config/database.js";
import { logger } from "./utils/logger.js";
import { createShutdownHandler } from "./server-lifecycle.js";

const startServer = async (): Promise<void> => {
  let server: Server | undefined;

  try {
    // Verify database connectivity before accepting requests.
    await connectDatabase();

    // Start the HTTP server.
    server = app.listen(env.PORT);

    // Wait until the HTTP server is actually listening.
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });

    logger.info(`AgentMacArthur running on port ${env.PORT}`);

    // Start periodic database pool monitoring.
    logDatabasePoolMetrics();
    const stopDatabasePoolMonitoring = startDatabasePoolMonitoring();

    const shutdown = createShutdownHandler(server, {
      closeDatabase: () => pool.end(),
      stopMonitoring: stopDatabasePoolMonitoring,
      logger,
      setExitCode: (code) => {
        process.exitCode = code;
      },
      forceExit: (code) => {
        process.exit(code);
      },
    });

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start AgentMacArthur", error);

    try {
      if (server?.listening) {
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
        });
      }

      await pool.end();
    } catch (shutdownError) {
      logger.error("Error cleaning up after startup failure", shutdownError);
    }

    process.exitCode = 1;
  }
};

void startServer();
