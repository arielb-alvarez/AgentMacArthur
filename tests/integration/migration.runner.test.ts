import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import path from "node:path";

import { migrationTestPool } from "../../src/config/migration-test-database.js";
import {
  runMigrations,
  getMigrationStatus,
} from "../../src/database/migration.runner.js";
import { env } from "../../src/config/env.js";

const baselineMigrationsDirectory = path.resolve(
  "tests/fixtures/baseline-migrations"
);

describe("Migration Runner", () => {
  beforeAll(async () => {
    const result = await migrationTestPool.query<{
      database_name: string;
    }>("SELECT current_database() AS database_name");

    const databaseName = result.rows[0]?.database_name;

    if (databaseName !== env.DB_MIGRATION_TEST_NAME) {
      throw new Error(
        `Unsafe migration test database: expected "${env.DB_MIGRATION_TEST_NAME}", connected to "${databaseName}".`
      );
    }

    if (
      databaseName === env.DB_NAME ||
      databaseName === env.DB_TEST_NAME
    ) {
      throw new Error(
        "Refusing to reset a non-migration test database."
      );
    }

    await migrationTestPool.query(
      "DROP SCHEMA public CASCADE"
    );

    await migrationTestPool.query(
      "CREATE SCHEMA public"
    );

    await runMigrations(migrationTestPool, {
      migrationsDirectory: baselineMigrationsDirectory,
    });
  });

  afterAll(async () => {
    await migrationTestPool.end();
  });

  it("should skip migrations that have already been executed", async () => {
    const before = await migrationTestPool.query<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY id ASC`
    );

    await runMigrations(migrationTestPool, {
      migrationsDirectory: baselineMigrationsDirectory,
    });

    const after = await migrationTestPool.query<{ name: string }>(
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
      runMigrations(migrationTestPool, { migrationsDirectory })
    ).rejects.toThrow();

    const tableResult = await migrationTestPool.query<{
      exists: string | null;
    }>(
      `
        SELECT to_regclass('public.migration_rollback_test') AS exists;
      `
    );

    const migrationResult = await migrationTestPool.query<{
      name: string;
    }>(
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

    await migrationTestPool.query(
      "DROP TABLE IF EXISTS migration_concurrency_test"
    );

    await migrationTestPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_concurrency_test.sql'`
    );

    try {
      await Promise.all([
        runMigrations(migrationTestPool, { migrationsDirectory }),
        runMigrations(migrationTestPool, { migrationsDirectory }),
      ]);

      const migrationResult = await migrationTestPool.query<{
        count: string;
      }>(
        `
          SELECT COUNT(*)::text AS count
          FROM schema_migrations
          WHERE name = '001_concurrency_test.sql';
        `
      );

      const tableResult = await migrationTestPool.query<{
        exists: string | null;
      }>(
        `
          SELECT to_regclass('public.migration_concurrency_test') AS exists;
        `
      );

      expect(migrationResult.rows[0].count).toBe("1");
      expect(tableResult.rows[0].exists).toBe(
        "migration_concurrency_test"
      );
    } finally {
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_concurrency_test"
      );

      await migrationTestPool.query(
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

    await migrationTestPool.query(
      "DROP TABLE IF EXISTS migration_checksum_test"
    );

    await migrationTestPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_checksum_test.sql'`
    );

    try {
      await runMigrations(migrationTestPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      await expect(
        runMigrations(migrationTestPool, {
          migrationsDirectory: modifiedMigrationsDirectory,
        })
      ).rejects.toThrow(
        "Migration checksum mismatch: 001_checksum_test.sql"
      );

      const columnResult = await migrationTestPool.query<{
        column_name: string;
      }>(
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
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_checksum_test"
      );

      await migrationTestPool.query(
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

    await migrationTestPool.query(
      "DROP TABLE IF EXISTS migration_deleted_test"
    );

    await migrationTestPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_deleted_test.sql'`
    );

    try {
      await runMigrations(migrationTestPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      await expect(
        runMigrations(migrationTestPool, {
          migrationsDirectory: remainingMigrationsDirectory,
        })
      ).rejects.toThrow(
        "Missing migration files: 001_deleted_test.sql"
      );

      const tableResult = await migrationTestPool.query<{
        exists: string | null;
      }>(
        `
          SELECT to_regclass('public.migration_deleted_test') AS exists;
        `
      );

      expect(tableResult.rows[0].exists).toBe(
        "migration_deleted_test"
      );
    } finally {
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_deleted_test"
      );

      await migrationTestPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_deleted_test.sql'`
      );
    }
  });

  // Migration Status Tests

  it("should report executed migrations", async () => {
    const migrations = await getMigrationStatus(migrationTestPool);

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

    const migrations = await getMigrationStatus(migrationTestPool, {
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

    await migrationTestPool.query(
      "DROP TABLE IF EXISTS migration_checksum_test"
    );

    await migrationTestPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_checksum_test.sql'`
    );

    try {
      await runMigrations(migrationTestPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      const migrations = await getMigrationStatus(migrationTestPool, {
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
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_checksum_test"
      );

      await migrationTestPool.query(
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

    await migrationTestPool.query(
      "DROP TABLE IF EXISTS migration_deleted_test"
    );

    await migrationTestPool.query(
      `DELETE FROM schema_migrations
       WHERE name = '001_deleted_test.sql'`
    );

    try {
      await runMigrations(migrationTestPool, {
        migrationsDirectory: initialMigrationsDirectory,
      });

      const migrations = await getMigrationStatus(migrationTestPool, {
        migrationsDirectory: remainingMigrationsDirectory,
      });

      const migration = migrations.find(
        (item) => item.name === "001_deleted_test.sql"
      );

      expect(migration).toBeDefined();
      expect(migration?.status).toBe("MISSING FILE");
      expect(migration?.checksum).toHaveLength(64);
    } finally {
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_deleted_test"
      );

      await migrationTestPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_deleted_test.sql'`
      );
    }
  });


  it("should migrate legacy memberships into the role and permission foundation", async () => {
    const roleBaselineDirectory = path.resolve(
      "tests/fixtures/role-migrations/baseline"
    );

    const sourceMigrationsDirectory = path.resolve(
      "src/database/migrations"
    );

    // First apply migrations 001–003.
    await runMigrations(migrationTestPool, {
      migrationsDirectory: roleBaselineDirectory,
    });

    const client = await migrationTestPool.connect();

    const userIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
      "10000000-0000-4000-8000-000000000006",
      "10000000-0000-4000-8000-000000000007",
      "10000000-0000-4000-8000-000000000008",
    ];

    const organizationId =
      "20000000-0000-4000-8000-000000000001";

    const projectId =
      "30000000-0000-4000-8000-000000000001";

    const legacyProjectRoles = [
      "project_owner",
      "project_manager",
      "technical_lead",
      "developer",
      "client",
      "stakeholder",
      "qa_engineer",
      "viewer",
    ];

    try {
      await client.query("BEGIN");

      // Create users.
      for (let index = 0; index < userIds.length; index += 1) {
        await client.query(
          `
            INSERT INTO users (
              id,
              email,
              password_hash,
              display_name,
              status
            )
            VALUES ($1, $2, $3, $4, 'active')
          `,
          [
            userIds[index],
            `role-migration-${index + 1}@example.com`,
            "test-password-hash",
            `Migration User ${index + 1}`,
          ]
        );
      }

      // Create organization.
      await client.query(
        `
          INSERT INTO organizations (
            id,
            name,
            slug,
            type,
            owner_user_id
          )
          VALUES ($1, $2, $3, 'team', $4)
        `,
        [
          organizationId,
          "Role Migration Test",
          "role-migration-test",
          userIds[0],
        ]
      );

      // Create legacy organization memberships.
      for (let index = 0; index < userIds.length; index += 1) {
        const role =
          index === 0
            ? "owner"
            : index === 1
              ? "admin"
              : "member";

        await client.query(
          `
            INSERT INTO organization_members (
              organization_id,
              user_id,
              role,
              status
            )
            VALUES ($1, $2, $3, 'active')
          `,
          [organizationId, userIds[index], role]
        );
      }

      // Create project.
      await client.query(
        `
          INSERT INTO projects (
            id,
            organization_id,
            name,
            created_by
          )
          VALUES ($1, $2, $3, $4)
        `,
        [
          projectId,
          organizationId,
          "Role Migration Project",
          userIds[0],
        ]
      );

      // Create legacy project memberships.
      for (let index = 0; index < userIds.length; index += 1) {
        await client.query(
          `
            INSERT INTO project_members (
              project_id,
              organization_id,
              user_id,
              role,
              status
            )
            VALUES ($1, $2, $3, $4, 'active')
          `,
          [
            projectId,
            organizationId,
            userIds[index],
            legacyProjectRoles[index],
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Apply the actual source migration directory.
    // Migrations 001–003 should be skipped; 004 should execute.
    await runMigrations(migrationTestPool, {
      migrationsDirectory: sourceMigrationsDirectory,
    });

    // Verify organization role backfill.
    const organizationRoles = await migrationTestPool.query<{
      user_id: string;
      role_key: string;
    }>(
      `
        SELECT
          omr.user_id,
          r.key AS role_key
        FROM organization_member_roles omr
        JOIN roles r ON r.id = omr.role_id
        ORDER BY omr.user_id
      `
    );

    expect(organizationRoles.rows).toHaveLength(8);

    expect(
      organizationRoles.rows.map((row) => row.role_key)
    ).toEqual([
      "owner",
      "admin",
      "member",
      "member",
      "member",
      "member",
      "member",
      "member",
    ]);

    // Verify project role backfill.
    const projectRoles = await migrationTestPool.query<{
      user_id: string;
      role_key: string;
    }>(
      `
        SELECT
          pmr.user_id,
          r.key AS role_key
        FROM project_member_roles pmr
        JOIN roles r ON r.id = pmr.role_id
        ORDER BY pmr.user_id
      `
    );

    expect(projectRoles.rows).toHaveLength(8);

    expect(
      projectRoles.rows.map((row) => row.role_key)
    ).toEqual(legacyProjectRoles);

    // Verify a member can hold multiple project roles.
    await migrationTestPool.query(
      `
        INSERT INTO project_member_roles (
          project_id,
          organization_id,
          user_id,
          role_id
        )
        SELECT
          $1,
          $2,
          $3,
          id
        FROM roles
        WHERE scope = 'project'
          AND key = 'code_reviewer'
      `,
      [projectId, organizationId, userIds[3]]
    );

    const multipleRoles = await migrationTestPool.query<{
      count: string;
    }>(
      `
        SELECT COUNT(*)::text AS count
        FROM project_member_roles
        WHERE project_id = $1
          AND user_id = $2
      `,
      [projectId, userIds[3]]
    );

    expect(multipleRoles.rows[0].count).toBe("2");

    // Organization roles must not be assigned as project roles.
    await expect(
      migrationTestPool.query(
        `
          INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id
          )
          SELECT
            $1,
            $2,
            $3,
            id
          FROM roles
          WHERE scope = 'organization'
            AND key = 'owner'
        `,
        [projectId, organizationId, userIds[0]]
      )
    ).rejects.toThrow();

    // A role's scope and key must be immutable.
    await expect(
      migrationTestPool.query(
        `
          UPDATE roles
          SET key = 'renamed_owner'
          WHERE scope = 'organization'
            AND key = 'owner'
        `
      )
    ).rejects.toThrow();

    // Built-in roles must not be deletable.
    await expect(
      migrationTestPool.query(
        `
          DELETE FROM roles
          WHERE scope = 'organization'
            AND key = 'owner'
        `
      )
    ).rejects.toThrow();

    // Permissions must not be deletable.
    await expect(
      migrationTestPool.query(
        `
          DELETE FROM permissions
          WHERE scope = 'organization'
            AND key = 'organization.view'
        `
      )
    ).rejects.toThrow();

    // Verify Migration 004 was recorded.
    const migrationResult = await migrationTestPool.query<{
      count: string;
    }>(
      `
        SELECT COUNT(*)::text AS count
        FROM schema_migrations
        WHERE name = '004_create_role_and_permission_foundation.sql'
      `
    );

    expect(migrationResult.rows[0].count).toBe("1");

    // Verify the database is up to date.
    const migrationStatus = await getMigrationStatus(
      migrationTestPool,
      {
        migrationsDirectory: sourceMigrationsDirectory,
      }
    );

    const migration004 = migrationStatus.find(
      (migration) =>
        migration.name ===
        "004_create_role_and_permission_foundation.sql"
    );

    expect(migration004?.status).toBe("EXECUTED");
  });
});
