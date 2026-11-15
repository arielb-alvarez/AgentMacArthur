import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

import { startServer } from "../../src/server-startup.js";

describe("Server startup", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers) {
      if (server.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    }

    servers.length = 0;
    vi.restoreAllMocks();
  });

  const createDependencies = () => {
    const server = createServer();
    servers.push(server);

    const signalHandlers = new Map<string, () => void>();

    const dependencies = {
      app: {
        listen: vi.fn(() => server.listen(0)),
      },
      port: 3000,
      connectDatabase: vi.fn().mockResolvedValue(undefined),
      closeDatabase: vi.fn().mockResolvedValue(undefined),
      logDatabasePoolMetrics: vi.fn(),
      startDatabasePoolMonitoring: vi.fn(() => vi.fn()),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerSignalHandler: vi.fn(
        (signal: "SIGTERM" | "SIGINT", handler: () => void) => {
          signalHandlers.set(signal, handler);
        }
      ),
      setExitCode: vi.fn(),
      forceExit: vi.fn(),
    };

    return { server, dependencies, signalHandlers };
  };

  it("starts the server and registers shutdown handlers", async () => {
    const { server, dependencies, signalHandlers } =
      createDependencies();

    await startServer(dependencies);

    expect(dependencies.connectDatabase).toHaveBeenCalledOnce();
    expect(dependencies.app.listen).toHaveBeenCalledWith(3000);
    expect(server.listening).toBe(true);

    expect(dependencies.logDatabasePoolMetrics).toHaveBeenCalledOnce();
    expect(
      dependencies.startDatabasePoolMonitoring
    ).toHaveBeenCalledOnce();

    expect(signalHandlers.has("SIGTERM")).toBe(true);
    expect(signalHandlers.has("SIGINT")).toBe(true);

    expect(dependencies.logger.info).toHaveBeenCalledWith(
      "AgentMacArthur running on port 3000"
    );
  });

  it("does not start the HTTP server when database connection fails", async () => {
    const { dependencies } = createDependencies();
    const databaseError = new Error("Database connection failed");

    dependencies.connectDatabase.mockRejectedValue(databaseError);

    await startServer(dependencies);

    expect(dependencies.app.listen).not.toHaveBeenCalled();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      "Failed to start AgentMacArthur",
      databaseError
    );
  });

  it("cleans up when the HTTP server fails to listen", async () => {
    const { server, dependencies } = createDependencies();
    const listenError = new Error("HTTP listen failed");

    dependencies.app.listen.mockImplementation(() => {
      queueMicrotask(() => {
        server.emit("error", listenError);
      });

      return server;
    });

    await startServer(dependencies);

    expect(dependencies.connectDatabase).toHaveBeenCalledOnce();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      "Failed to start AgentMacArthur",
      listenError
    );

    expect(
      dependencies.startDatabasePoolMonitoring
    ).not.toHaveBeenCalled();
  });

  it("logs cleanup failures after startup fails", async () => {
    const { dependencies } = createDependencies();
    const startupError = new Error("Database connection failed");
    const cleanupError = new Error("Database cleanup failed");

    dependencies.connectDatabase.mockRejectedValue(startupError);
    dependencies.closeDatabase.mockRejectedValue(cleanupError);

    await startServer(dependencies);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      "Error cleaning up after startup failure",
      cleanupError
    );

    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
  });

  it("should execute graceful shutdown when a signal is received", async () => {
    const { dependencies, signalHandlers } = createDependencies();

    await startServer(dependencies);

    const sigtermHandler = signalHandlers.get("SIGTERM");
    const sigintHandler = signalHandlers.get("SIGINT");

    expect(sigtermHandler).toBeDefined();
    expect(sigintHandler).toBeDefined();

    sigtermHandler!();

    await vi.waitFor(() => {
        expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
    });

    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();

    // A second signal must not start another shutdown.
    sigintHandler!();

    expect(dependencies.logger.warn).toHaveBeenCalledWith(
        "Shutdown already in progress"
    );
  });

  it("should close the listening server when startup fails afterward", async () => {
    const { server, dependencies } = createDependencies();
    const startupError = new Error("Pool metrics failed");

    dependencies.logDatabasePoolMetrics.mockImplementation(() => {
        throw startupError;
    });

    await startServer(dependencies);

    expect(server.listening).toBe(false);
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
        "Failed to start AgentMacArthur",
        startupError
    );
  });
});
