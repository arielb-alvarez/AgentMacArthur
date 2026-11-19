import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool, PoolClient } from "pg";

import { pool as defaultPool } from "../config/database.js";

const MIGRATION_LOCK_ID = 928374;

export interface MigrationRunnerOptions {
  migrationsDirectory?: string;
}

interface ExecutedMigration {
  name: string;
  checksum: string | null;
}

export interface MigrationStatus {
  name: string;
  status:
  | "PENDING"
  | "EXECUTED"
  | "CHECKSUM NOT INITIALIZED"
  | "CHECKSUM MISMATCH"
  | "MISSING FILE";
  checksum: string | null;
  expectedChecksum?: string;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

const getMigrationsDirectory = (
  directory?: string
): string => {
  return directory ?? resolve(moduleDirectory, "migrations");
};

const getMigrationFiles = async (
  directory: string
): Promise<string[]> => {
  const files = await readdir(directory);

  return files
    .filter((file) => file.endsWith(".sql"))
    .sort();
};

const generateChecksum = (content: string): string => {
  return createHash("sha256")
    .update(content)
    .digest("hex");
};

const getExecutedMigrations = async (
  db: Pool
): Promise<ExecutedMigration[]> => {
  const result = await db.query<ExecutedMigration>(
    `SELECT name, checksum
     FROM schema_migrations
     ORDER BY id ASC`
  );

  return result.rows;
};

export const getMigrationStatus = async (
  db: Pool = defaultPool,
  options: MigrationRunnerOptions = {}
): Promise<MigrationStatus[]> => {
  const migrationsDirectory = getMigrationsDirectory(
    options.migrationsDirectory
  );

  const migrationFiles = await getMigrationFiles(
    migrationsDirectory
  );

  const tableResult = await db.query<{ exists: boolean }>(
    `
      SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists;
    `
  );

  const executedMigrations = tableResult.rows[0].exists
    ? await getExecutedMigrations(db)
    : [];

  const statuses: MigrationStatus[] = [];

  for (const migrationFile of migrationFiles) {
    const migrationPath = join(
      migrationsDirectory,
      migrationFile
    );

    const sql = await readFile(migrationPath, "utf-8");
    const expectedChecksum = generateChecksum(sql);

    const executedMigration = executedMigrations.find(
      (migration) => migration.name === migrationFile
    );

    if (!executedMigration) {
      statuses.push({
        name: migrationFile,
        status: "PENDING",
        checksum: expectedChecksum,
      });

      continue;
    }

    if (executedMigration.checksum === null) {
      statuses.push({
        name: migrationFile,
        status: "CHECKSUM NOT INITIALIZED",
        checksum: null,
        expectedChecksum,
      });

      continue;
    }

    if (executedMigration.checksum !== expectedChecksum) {
      statuses.push({
        name: migrationFile,
        status: "CHECKSUM MISMATCH",
        checksum: executedMigration.checksum,
        expectedChecksum,
      });

      continue;
    }

    statuses.push({
      name: migrationFile,
      status: "EXECUTED",
      checksum: executedMigration.checksum,
    });
  }

  for (const executedMigration of executedMigrations) {
    const fileExists = migrationFiles.includes(
      executedMigration.name
    );

    if (!fileExists) {
      statuses.push({
        name: executedMigration.name,
        status: "MISSING FILE",
        checksum: executedMigration.checksum,
      });
    }
  }

  return statuses;
};

const validateMigrationFiles = (
  migrationFiles: string[],
  executedMigrations: ExecutedMigration[]
): void => {
  const availableMigrations = new Set(migrationFiles);

  const missingMigrations = executedMigrations
    .filter(
      (migration) => !availableMigrations.has(migration.name)
    )
    .map((migration) => migration.name);

  if (missingMigrations.length > 0) {
    throw new Error(
      "Missing migration files: " +
      `${missingMigrations.join(", ")}. ` +
      "An already executed migration file has been deleted."
    );
  }
};

const updateMigrationChecksum = async (
  db: Pool,
  migrationName: string,
  checksum: string
): Promise<void> => {
  await db.query(
    `UPDATE schema_migrations
     SET checksum = $1
     WHERE name = $2
       AND checksum IS NULL`,
    [checksum, migrationName]
  );
};

const toError = (
  error: unknown,
  context: string
): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(`${context}: ${String(error)}`);
};

const executeMigration = async (
  db: Pool,
  migrationName: string,
  sql: string,
  checksum: string
): Promise<void> => {
  const client = await db.connect();

  let releaseError: Error | undefined;

  try {
    await client.query("BEGIN");

    await client.query(sql);

    await client.query(
      `INSERT INTO schema_migrations (name, checksum)
       VALUES ($1, $2)`,
      [migrationName, checksum]
    );

    await client.query("COMMIT");
  } catch (migrationError) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      releaseError = toError(
        rollbackError,
        "Migration rollback failed"
      );

      console.error(
        `Migration rollback failed for ${migrationName}. ` +
        "The database connection will be discarded.",
        rollbackError
      );
    }

    throw migrationError;
  } finally {
    client.release(releaseError);
  }
};

const acquireMigrationLock = async (
  client: PoolClient
): Promise<void> => {
  await client.query(
    "SELECT pg_advisory_lock($1)",
    [MIGRATION_LOCK_ID]
  );
};

const releaseMigrationLock = async (
  client: PoolClient
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
      checksum VARCHAR(64),
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    ALTER TABLE schema_migrations
    ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
  `);
};

export const runMigrations = async (
  db: Pool = defaultPool,
  options: MigrationRunnerOptions = {}
): Promise<void> => {
  const client = await db.connect();

  let lockAcquired = false;
  let primaryError: unknown;

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

    validateMigrationFiles(
      migrationFiles,
      executedMigrations
    );

    let executedCount = 0;

    for (const migrationFile of migrationFiles) {
      const migrationPath = join(
        migrationsDirectory,
        migrationFile
      );

      const sql = await readFile(migrationPath, "utf-8");
      const checksum = generateChecksum(sql);

      const executedMigration = executedMigrations.find(
        (migration) => migration.name === migrationFile
      );

      if (executedMigration) {
        if (executedMigration.checksum === null) {
          await updateMigrationChecksum(
            db,
            migrationFile,
            checksum
          );

          console.log(
            `Migration checksum initialized: ${migrationFile}`
          );

          continue;
        }

        if (executedMigration.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch: ${migrationFile}. ` +
            "An already executed migration has been modified."
          );
        }

        continue;
      }

      await executeMigration(
        db,
        migrationFile,
        sql,
        checksum
      );

      executedCount++;

      console.log(`Migration executed: ${migrationFile}`);
    }

    await db.query(`
      ALTER TABLE schema_migrations
      ALTER COLUMN checksum SET NOT NULL;
    `);

    if (executedCount === 0) {
      console.log("Database is already up to date.");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let releaseError: Error | undefined;

    try {
      if (lockAcquired) {
        await releaseMigrationLock(client);
      }
    } catch (unlockError) {
      releaseError = toError(
        unlockError,
        "Migration advisory lock release failed"
      );

      if (primaryError === undefined) {
        throw unlockError;
      }

      console.error(
        "Failed to release the migration advisory lock. " +
        "The database connection will be discarded.",
        unlockError
      );
    } finally {
      client.release(releaseError);
    }
  }
};
