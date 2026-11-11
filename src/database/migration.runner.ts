
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool } from "pg";

import { pool as defaultPool } from "../config/database.js";

const MIGRATION_LOCK_ID = 928374;

export interface MigrationRunnerOptions {
  migrationsDirectory?: string;
}

const getMigrationsDirectory = (
  directory?: string
): string => {
  return directory ?? path.resolve("src/database/migrations");
};

const getMigrationFiles = async (
  directory: string
): Promise<string[]> => {
  const files = await readdir(directory);

  return files
    .filter((file) => file.endsWith(".sql"))
    .sort();
};

const getExecutedMigrations = async (
  db: Pool
): Promise<string[]> => {
  const result = await db.query<{ name: string }>(
    `SELECT name FROM schema_migrations ORDER BY id ASC`
  );

  return result.rows.map((row) => row.name);
};

const executeMigration = async (
  db: Pool,
  migrationName: string,
  sql: string
): Promise<void> => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(sql);

    await client.query(
      `INSERT INTO schema_migrations (name)
       VALUES ($1)`,
      [migrationName]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const acquireMigrationLock = async (
  client: import("pg").PoolClient
): Promise<void> => {
  await client.query(
    "SELECT pg_advisory_lock($1)",
    [MIGRATION_LOCK_ID]
  );
};

const releaseMigrationLock = async (
  client: import("pg").PoolClient
): Promise<void> => {
  await client.query(
    "SELECT pg_advisory_unlock($1)",
    [MIGRATION_LOCK_ID]
  );
};

export const createMigrationTable = async (
  db: Pool = defaultPool
): Promise<void> => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

export const runMigrations = async (
  db: Pool = defaultPool,
  options: MigrationRunnerOptions = {}
): Promise<void> => {
  const client = await db.connect();

  let lockAcquired = false;

  try {
    await acquireMigrationLock(client);
    lockAcquired = true;

    await createMigrationTable(db);

    const migrationsDirectory = getMigrationsDirectory(
      options.migrationsDirectory
    );

    const migrationFiles = await getMigrationFiles(
      migrationsDirectory
    );

    const executedMigrations = await getExecutedMigrations(db);

    const pendingMigrations = migrationFiles.filter(
      (file) => !executedMigrations.includes(file)
    );

    for (const migrationFile of pendingMigrations) {
      const migrationPath = path.join(
        migrationsDirectory,
        migrationFile
      );

      const sql = await readFile(migrationPath, "utf-8");

      await executeMigration(db, migrationFile, sql);

      console.log(`Migration executed: ${migrationFile}`);
    }

    if (pendingMigrations.length === 0) {
      console.log("Database is already up to date.");
    }
  } finally {
    try {
      if (lockAcquired) {
        await releaseMigrationLock(client);
      }
    } finally {
      client.release();
    }
  }
};
