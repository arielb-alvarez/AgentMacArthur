import type { Server } from "node:http";
import { createShutdownHandler } from "./server-lifecycle.js";

interface StartupLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

type Signal = "SIGTERM" | "SIGINT";

interface ServerStartupDependencies {
  app: {
    listen(port: number): Server;
  };
  port: number;
  connectDatabase: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  logDatabasePoolMetrics: () => void;
  startDatabasePoolMonitoring: () => () => void;
  logger: StartupLogger;
  registerSignalHandler: (
    signal: Signal,
    handler: () => void
  ) => void;
  setExitCode: (code: number) => void;
  forceExit: (code: number) => void;
}

export const startServer = async (
  dependencies: ServerStartupDependencies
): Promise<void> => {
  const {
    app,
    port,
    connectDatabase,
    closeDatabase,
    logDatabasePoolMetrics,
    startDatabasePoolMonitoring,
    logger,
    registerSignalHandler,
    setExitCode,
    forceExit,
  } = dependencies;

  let server: Server | undefined;

  try {
    // Verify database connectivity before accepting requests.
    await connectDatabase();

    // Start the HTTP server.
    server = app.listen(port);

    // Wait until the HTTP server is actually listening.
    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        server?.off("error", onError);
        resolve();
      };

      const onError = (error: Error) => {
        server?.off("listening", onListening);
        reject(error);
      };

      server?.once("listening", onListening);
      server?.once("error", onError);
    });

    logger.info(`AgentMacArthur running on port ${port}`);

    // Start periodic database pool monitoring.
    logDatabasePoolMetrics();

    const stopDatabasePoolMonitoring =
      startDatabasePoolMonitoring();

    const shutdown = createShutdownHandler(server, {
      closeDatabase,
      stopMonitoring: stopDatabasePoolMonitoring,
      logger,
      setExitCode,
      forceExit,
    });

    registerSignalHandler("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    registerSignalHandler("SIGINT", () => {
      void shutdown("SIGINT");
    });
  } catch (error) {
    logger.error("Failed to start AgentMacArthur", error);

    try {
      if (server?.listening) {
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
        });
      }

      await closeDatabase();
    } catch (shutdownError) {
      logger.error(
        "Error cleaning up after startup failure",
        shutdownError
      );
    }

    setExitCode(1);
  }
};
