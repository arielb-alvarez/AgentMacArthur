import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Pool, PoolClient } from "pg";

import { logger } from "../../src/utils/logger.js";

import {
  PostgresTransactionManager,
} from "../../src/database/transaction-manager.js";

describe("PostgresTransactionManager", () => {
  let client: PoolClient;
  let db: Pool;
  let query: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let connect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn().mockResolvedValue({ rows: [] });
    release = vi.fn();

    client = {
      query,
      release,
    } as unknown as PoolClient;

    connect = vi.fn().mockResolvedValue(client);

    db = {
      connect,
    } as unknown as Pool;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should commit a successful transaction", async () => {
    const manager = new PostgresTransactionManager(
      db,
      30000,
      Number.MAX_SAFE_INTEGER
    );

    const operation = vi.fn().mockResolvedValue("success");

    const result = await manager.runInTransaction(
      "testOperation",
      operation
    );

    expect(result).toBe("success");
    expect(connect).toHaveBeenCalledOnce();

    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");

    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('statement_timeout', $1, true)",
      ["30000ms"]
    );

    expect(operation).toHaveBeenCalledWith(client);

    expect(query).toHaveBeenNthCalledWith(3, "COMMIT");

    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("should roll back when the operation fails", async () => {
    const manager = new PostgresTransactionManager(
      db,
      30000,
      Number.MAX_SAFE_INTEGER
    );

    const operationError = new Error("Operation failed");

    const operation = vi.fn().mockRejectedValue(operationError);

    await expect(
      manager.runInTransaction("testOperation", operation)
    ).rejects.toThrow("Operation failed");

    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");

    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('statement_timeout', $1, true)",
      ["30000ms"]
    );

    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");

    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("should release the connection with an error when rollback fails", async () => {
    const manager = new PostgresTransactionManager(
      db,
      30000,
      Number.MAX_SAFE_INTEGER
    );

    const operationError = new Error("Operation failed");
    const rollbackError = new Error("Rollback failed");

    query.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") {
        throw rollbackError;
      }

      return { rows: [] };
    });

    const operation = vi.fn().mockRejectedValue(operationError);

    await expect(
      manager.runInTransaction("testOperation", operation)
    ).rejects.toThrow("Operation failed");

    expect(release).toHaveBeenCalledWith(rollbackError);
  });

  it("should release the connection when the operation succeeds even if its result is undefined", async () => {
    const manager = new PostgresTransactionManager(
      db,
      30000,
      Number.MAX_SAFE_INTEGER
    );

    const result = await manager.runInTransaction(
      "testOperation",
      async () => undefined
    );

    expect(result).toBeUndefined();
    expect(release).toHaveBeenCalledOnce();
  });

  it("should log slow transactions", async () => {
    const warnSpy = vi.spyOn(logger, "warn");

    const manager = new PostgresTransactionManager(
      db,
      30000,
      0
    );

    await manager.runInTransaction(
      "slowOperation",
      async () => "success"
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "Slow database transaction detected",
      expect.objectContaining({
        operation: "slowOperation",
        thresholdMs: 0,
      })
    );
  });

  it("should propagate connection acquisition errors", async () => {
    const connectionError = new Error("Connection unavailable");

    connect.mockRejectedValue(connectionError);

    const manager = new PostgresTransactionManager(
      db,
      30000,
      Number.MAX_SAFE_INTEGER
    );

    await expect(
      manager.runInTransaction(
        "testOperation",
        async () => "success"
      )
    ).rejects.toThrow("Connection unavailable");

    expect(release).not.toHaveBeenCalled();
  });
});
