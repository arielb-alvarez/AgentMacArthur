import type { Pool, PoolClient } from "pg";

import { pool as defaultPool } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface TransactionManager {
  runInTransaction<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T>;
}

export class PostgresTransactionManager
  implements TransactionManager
{
  constructor(
    private readonly db: Pool = defaultPool,
    private readonly queryTimeoutMs: number = env.DB_QUERY_TIMEOUT_MS,
    private readonly slowQueryThresholdMs: number =
      env.DB_SLOW_QUERY_THRESHOLD_MS
  ) {}

  async runInTransaction<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const startedAt = process.hrtime.bigint();

    const client = await this.db.connect();
    let releaseError: Error | undefined;

    try {
      await client.query("BEGIN");

      await client.query(
        "SELECT set_config('statement_timeout', $1, true)",
        [`${this.queryTimeoutMs}ms`]
      );

      const result = await operation(client);

      await client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back database transaction");
      }

      throw error;
    } finally {
      client.release(releaseError);

      const durationMs = Number(
        (
          Number(process.hrtime.bigint() - startedAt) / 1_000_000
        ).toFixed(2)
      );

      if (durationMs >= this.slowQueryThresholdMs) {
        logger.warn("Slow database transaction detected", {
          operation: operationName,
          durationMs,
          thresholdMs: this.slowQueryThresholdMs,
        });
      }
    }
  }
}
