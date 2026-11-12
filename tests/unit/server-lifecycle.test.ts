import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { createShutdownHandler } from "../../src/server-lifecycle.js";

describe("Server lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const createTestServer = () => {
    const server = createServer();

    const close = vi.fn(
      (callback: (error?: Error) => void) => {
        callback();
        return server;
      }
    );

    const closeAllConnections = vi.fn();

    server.close = close as typeof server.close;
    server.closeAllConnections = closeAllConnections;

    return { server, close, closeAllConnections };
  };

  const createDependencies = () => ({
    closeDatabase: vi.fn().mockResolvedValue(undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    setExitCode: vi.fn(),
    forceExit: vi.fn(),
    timeoutMs: 1000,
  });

  it("should close HTTP server and database successfully", async () => {
    const { server, close } = createTestServer();
    const dependencies = createDependencies();

    const shutdown = createShutdownHandler(server, dependencies);

    await shutdown("SIGINT");

    expect(close).toHaveBeenCalledOnce();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
    expect(dependencies.logger.info).toHaveBeenCalledWith(
      "Graceful shutdown completed"
    );
  });

  it("should prevent duplicate shutdown attempts", async () => {
    const { server, close } = createTestServer();
    const dependencies = createDependencies();

    const shutdown = createShutdownHandler(server, dependencies);

    await shutdown("SIGINT");
    await shutdown("SIGTERM");

    expect(close).toHaveBeenCalledOnce();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      "Shutdown already in progress"
    );
  });

  it("should close the database even if HTTP shutdown fails", async () => {
    const { server } = createTestServer();
    const dependencies = createDependencies();

    const closeError = new Error("HTTP shutdown failed");

    server.close = vi.fn((callback) => {
      callback(closeError);
      return server;
    }) as typeof server.close;

    const shutdown = createShutdownHandler(server, dependencies);

    await shutdown("SIGINT");

    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith(
      "Error closing HTTP server",
      closeError
    );
  });

  it("should report database shutdown failures", async () => {
    const { server } = createTestServer();
    const dependencies = createDependencies();

    const databaseError = new Error("Database shutdown failed");

    dependencies.closeDatabase.mockRejectedValue(databaseError);

    const shutdown = createShutdownHandler(server, dependencies);

    await shutdown("SIGTERM");

    expect(dependencies.setExitCode).toHaveBeenCalledWith(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith(
      "Error closing database connections",
      databaseError
    );
  });

  it("should force exit when graceful shutdown times out", async () => {
    vi.useFakeTimers();

    const { server, closeAllConnections } = createTestServer();
    const dependencies = createDependencies();

    // Simulate an HTTP server that never finishes closing.
    server.close = vi.fn(() => server) as typeof server.close;

    const shutdown = createShutdownHandler(server, dependencies);

    // Intentionally remains pending because server.close never calls back.
    void shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(1000);

    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(dependencies.forceExit).toHaveBeenCalledWith(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith(
        "Graceful shutdown timed out. Forcing exit."
    );
  });
});
