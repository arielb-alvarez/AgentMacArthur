
import { describe, it, expect } from "vitest";
import path from "node:path";

import { testPool } from "../../src/config/test-database.js";
import {
  runMigrations,
  getMigrationStatus,
} from "../../src/database/migration.runner.js";

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

    try {
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
    } finally {
      await testPool.query(
        "DROP TABLE IF EXISTS migration_concurrency_test"
      );

      await testPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_concurrency_test.sql'`
      );
    }
  });

  it("should detect when an already executed migration has been modified", async () => {
    const initialMigrationsDirectory = path.resolve(
      "tests/fixtures/checksum-migrations/initial"
    );

    const modifiedMigrationsDirectory = path.resolve(
      "tests/fixtures/checksum-migrations/modified"
    );

    await testPool.query(
      "DROP TABLE IF EXISTS migration_checksum_test"
    );

    await testPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_checksum_test.sql'`
    );

    try {
      await runMigrations(testPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      await expect(
        runMigrations(testPool, {
          migrationsDirectory: modifiedMigrationsDirectory,
        })
      ).rejects.toThrow(
        "Migration checksum mismatch: 001_checksum_test.sql"
      );

      const columnResult = await testPool.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'migration_checksum_test'
        `
      );

      const columnNames = columnResult.rows.map(
        (column) => column.column_name
      );

      expect(columnNames).toContain("id");
      expect(columnNames).not.toContain("description");
    } finally {
      await testPool.query(
        "DROP TABLE IF EXISTS migration_checksum_test"
      );

      await testPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_checksum_test.sql'`
      );
    }
  });

  it("should detect when an already executed migration file has been deleted", async () => {
    const initialMigrationsDirectory = path.resolve(
      "tests/fixtures/deleted-migrations/initial"
    );

    const remainingMigrationsDirectory = path.resolve(
      "tests/fixtures/deleted-migrations/remaining"
    );

    await testPool.query(
      "DROP TABLE IF EXISTS migration_deleted_test"
    );

    await testPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_deleted_test.sql'`
    );

    try {
      await runMigrations(testPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      await expect(
        runMigrations(testPool, {
          migrationsDirectory: remainingMigrationsDirectory,
        })
      ).rejects.toThrow(
        "Missing migration files: 001_deleted_test.sql"
      );

      const tableResult = await testPool.query<{ exists: string | null }>(
        `
          SELECT to_regclass('public.migration_deleted_test') AS exists;
        `
      );

      expect(tableResult.rows[0].exists).toBe(
        "migration_deleted_test"
      );
    } finally {
      await testPool.query(
        "DROP TABLE IF EXISTS migration_deleted_test"
      );

      await testPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_deleted_test.sql'`
      );
    }
  });

  // Migration Status Tests

  it("should report executed migrations", async () => {
    const migrations = await getMigrationStatus(testPool);

    const migration = migrations.find(
      (item) => item.name === "001_create_conversations.sql"
    );

    expect(migration).toBeDefined();
    expect(migration?.status).toBe("EXECUTED");
    expect(migration?.checksum).toHaveLength(64);
  });

  it("should report pending migrations", async () => {
    const migrationsDirectory = path.resolve(
      "tests/fixtures/migrations"
    );

    const migrations = await getMigrationStatus(testPool, {
      migrationsDirectory,
    });

    const migration = migrations.find(
      (item) => item.name === "001_intentional_failure.sql"
    );

    expect(migration).toBeDefined();
    expect(migration?.status).toBe("PENDING");
  });

  it("should report checksum mismatches", async () => {
    const initialMigrationsDirectory = path.resolve(
      "tests/fixtures/checksum-migrations/initial"
    );

    const modifiedMigrationsDirectory = path.resolve(
      "tests/fixtures/checksum-migrations/modified"
    );

    await testPool.query(
      "DROP TABLE IF EXISTS migration_checksum_test"
    );

    await testPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_checksum_test.sql'`
    );

    try {
      await runMigrations(testPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      const migrations = await getMigrationStatus(testPool, {
        migrationsDirectory: modifiedMigrationsDirectory,
      });

      const migration = migrations.find(
        (item) => item.name === "001_checksum_test.sql"
      );

      expect(migration?.status).toBe("CHECKSUM MISMATCH");
      expect(migration?.checksum).toHaveLength(64);
      expect(migration?.expectedChecksum).toHaveLength(64);
      expect(migration?.checksum).not.toBe(
        migration?.expectedChecksum
      );
    } finally {
      await testPool.query(
        "DROP TABLE IF EXISTS migration_checksum_test"
      );

      await testPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_checksum_test.sql'`
      );
    }
  });

  it("should report missing migration files", async () => {
    const initialMigrationsDirectory = path.resolve(
      "tests/fixtures/deleted-migrations/initial"
    );

    const remainingMigrationsDirectory = path.resolve(
      "tests/fixtures/deleted-migrations/remaining"
    );

    await testPool.query(
      "DROP TABLE IF EXISTS migration_deleted_test"
    );

    await testPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_deleted_test.sql'`
    );

    try {
      await runMigrations(testPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      const migrations = await getMigrationStatus(testPool, {
        migrationsDirectory: remainingMigrationsDirectory,
      });

      const migration = migrations.find(
        (item) => item.name === "001_deleted_test.sql"
      );

      expect(migration).toBeDefined();
      expect(migration?.status).toBe("MISSING FILE");
      expect(migration?.checksum).toHaveLength(64);
    } finally {
      await testPool.query(
        "DROP TABLE IF EXISTS migration_deleted_test"
      );

      await testPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_deleted_test.sql'`
      );
    }
  });
});
