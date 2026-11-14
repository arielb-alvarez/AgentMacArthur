import type { Server } from "node:http";

interface ShutdownLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

interface ShutdownDependencies {
  closeDatabase: () => Promise<void>;
  logger: ShutdownLogger;
  setExitCode: (code: number) => void;
  forceExit: (code: number) => void;
  timeoutMs?: number;
  stopMonitoring?: () => void;
}

export const createShutdownHandler = (
  server: Server,
  dependencies: ShutdownDependencies
) => {
  const {
    closeDatabase,
    stopMonitoring,
    logger,
    setExitCode,
    forceExit,
    timeoutMs = 10_000,
  } = dependencies;

  let isShuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn("Shutdown already in progress");
      return;
    }

    isShuttingDown = true;

    try {
      stopMonitoring?.();
    } catch (error) {
      logger.error("Error stopping database pool monitoring", error);
    }

    logger.info(`${signal} received. Shutting down...`);

    const timeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out. Forcing exit.");
      server.closeAllConnections();
      forceExit(1);
    }, timeoutMs);

    let shutdownFailed = false;

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      logger.info("HTTP server closed");
    } catch (error) {
      shutdownFailed = true;
      logger.error("Error closing HTTP server", error);
    }

    try {
      await closeDatabase();
      logger.info("Database connections closed");
    } catch (error) {
      shutdownFailed = true;
      logger.error("Error closing database connections", error);
    }

    clearTimeout(timeout);

    if (shutdownFailed) {
      setExitCode(1);
      return;
    }

    logger.info("Graceful shutdown completed");
    setExitCode(0);
  };
};
