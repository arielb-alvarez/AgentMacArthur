
import { describe, it, expect } from "vitest";
import path from "node:path";

import { testPool } from "../../src/config/test-database.js";
import { runMigrations } from "../../src/database/migration.runner.js";

describe("Migration Runner", () => {
  it("should skip migrations that have already been executed", async () => {
    const before = await testPool.query<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY id ASC`
    );

    await runMigrations(testPool);

    const after = await testPool.query<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY id ASC`
    );

    expect(after.rows).toEqual(before.rows);
    expect(after.rows).toContainEqual({
      name: "001_create_conversations.sql",
    });
  });

  it("should rollback a failed migration and not record it", async () => {
    const migrationsDirectory = path.resolve(
      "tests/fixtures/migrations"
    );

    await expect(
      runMigrations(testPool, { migrationsDirectory })
    ).rejects.toThrow();

    const tableResult = await testPool.query<{ exists: string | null }>(
      `
        SELECT to_regclass('public.migration_rollback_test') AS exists;
      `
    );

    const migrationResult = await testPool.query<{ name: string }>(
      `
        SELECT name
        FROM schema_migrations
        WHERE name = '001_intentional_failure.sql';
      `
    );

    expect(tableResult.rows[0].exists).toBeNull();
    expect(migrationResult.rows).toHaveLength(0);
  });


  it("should prevent duplicate execution during concurrent migration runs", async () => {
    const migrationsDirectory = path.resolve(
        "tests/fixtures/concurrent-migrations"
    );

    await testPool.query(
        "DROP TABLE IF EXISTS migration_concurrency_test"
    );

    await testPool.query(
        `DELETE FROM schema_migrations
        WHERE name = '001_concurrency_test.sql'`
    );

    await Promise.all([
        runMigrations(testPool, { migrationsDirectory }),
        runMigrations(testPool, { migrationsDirectory }),
    ]);

    const migrationResult = await testPool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM schema_migrations
        WHERE name = '001_concurrency_test.sql';
        `
    );

    const tableResult = await testPool.query<{ exists: string | null }>(
        `
        SELECT to_regclass('public.migration_concurrency_test') AS exists;
        `
    );

    expect(migrationResult.rows[0].count).toBe("1");
    expect(tableResult.rows[0].exists).toBe(
        "migration_concurrency_test"
    );

    await testPool.query(
        "DROP TABLE IF EXISTS migration_concurrency_test"
    );

    await testPool.query(
        `DELETE FROM schema_migrations
        WHERE name = '001_concurrency_test.sql'`
    );
  });
});
