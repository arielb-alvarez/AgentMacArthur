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

  it("should report migrations with uninitialized checksums", async () => {
    const migrationsDirectory = path.resolve(
      "tests/fixtures/checksum-migrations/initial"
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
        migrationsDirectory,
      });

      // Simulate a legacy migration record created before
      // checksum enforcement was introduced.
      await migrationTestPool.query(
        `ALTER TABLE schema_migrations
         ALTER COLUMN checksum DROP NOT NULL`
      );

      await migrationTestPool.query(
        `UPDATE schema_migrations
         SET checksum = NULL
         WHERE name = '001_checksum_test.sql'`
      );

      const migrations = await getMigrationStatus(
        migrationTestPool,
        { migrationsDirectory }
      );

      const migration = migrations.find(
        (item) => item.name === "001_checksum_test.sql"
      );

      expect(migration).toBeDefined();
      expect(migration?.status).toBe(
        "CHECKSUM NOT INITIALIZED"
      );
      expect(migration?.checksum).toBeNull();
      expect(migration?.expectedChecksum).toHaveLength(64);
    } finally {
      await migrationTestPool.query(
        "DROP TABLE IF EXISTS migration_checksum_test"
      );

      await migrationTestPool.query(
        `DELETE FROM schema_migrations
         WHERE name = '001_checksum_test.sql'`
      );

      await migrationTestPool.query(
        `ALTER TABLE schema_migrations
         ALTER COLUMN checksum SET NOT NULL`
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

  it("should migrate legacy memberships and invitations into the role and permission foundations", async () => {
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

      // Create legacy invitations before Migration 004 and 005.
      // Migration 005 must backfill their string-based roles.
      await client.query(
        `
          INSERT INTO invitations (
            id,
            organization_id,
            project_id,
            email,
            role,
            token_hash,
            invited_by,
            accepted_by,
            status,
            expires_at,
            accepted_at,
            created_at
          )
          VALUES
            (
              '40000000-0000-4000-8000-000000000001',
              $1,
              NULL,
              'accepted-admin@example.com',
              'admin',
              REPEAT('a', 64),
              $2,
              $3,
              'accepted',
              NOW() + INTERVAL '7 days',
              NOW() - INTERVAL '1 hour',
              NOW() - INTERVAL '2 days'
            ),
            (
              '40000000-0000-4000-8000-000000000002',
              $1,
              NULL,
              'expired-member@example.com',
              'member',
              REPEAT('b', 64),
              $2,
              NULL,
              'pending',
              NOW() - INTERVAL '1 day',
              NULL,
              NOW() - INTERVAL '2 days'
            ),
            (
              '40000000-0000-4000-8000-000000000003',
              $1,
              $4,
              'project-manager@example.com',
              'project_manager',
              REPEAT('c', 64),
              $2,
              NULL,
              'pending',
              NOW() + INTERVAL '7 days',
              NULL,
              NOW()
            )
        `,
        [
          organizationId,
          userIds[0],
          userIds[1],
          projectId,
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Apply the actual source migration directory.
    // Migrations 001–003 should be skipped; 004 and 005 should execute.
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

    // Verify invitation role backfill and expiration handling.
    const invitationResults = await migrationTestPool.query<{
      email: string;
      role_key: string;
      status: string;
      email_delivery_status: string;
      accepted_by: string | null;
      accepted_at: Date | null;
    }>(
      `
        SELECT
          i.email,
          r.key AS role_key,
          i.status,
          i.email_delivery_status,
          i.accepted_by,
          i.accepted_at
        FROM invitations i
        JOIN roles r ON r.id = i.role_id
        ORDER BY i.email
      `
    );

    expect(invitationResults.rows).toHaveLength(3);

    expect(invitationResults.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "accepted-admin@example.com",
          role_key: "admin",
          status: "accepted",
          email_delivery_status: "unknown",
        }),
        expect.objectContaining({
          email: "expired-member@example.com",
          role_key: "member",
          status: "expired",
          email_delivery_status: "unknown",
          accepted_by: null,
          accepted_at: null,
        }),
        expect.objectContaining({
          email: "project-manager@example.com",
          role_key: "project_manager",
          status: "pending",
          email_delivery_status: "unknown",
        }),
      ])
    );

    const acceptedInvitation = invitationResults.rows.find(
      (row) => row.email === "accepted-admin@example.com"
    );

    expect(acceptedInvitation?.accepted_by).toBe(userIds[1]);
    expect(acceptedInvitation?.accepted_at).not.toBeNull();

    // The legacy role column must no longer exist.
    const legacyRoleColumn = await migrationTestPool.query<{
      exists: boolean;
    }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'invitations'
            AND column_name = 'role'
        ) AS exists
      `
    );

    expect(legacyRoleColumn.rows[0].exists).toBe(false);

    // Organization invitations must not grant ownership.
    await expect(
      migrationTestPool.query(
        `
          INSERT INTO invitations (
            id,
            organization_id,
            email,
            role_id,
            token_hash,
            invited_by,
            expires_at
          )
          SELECT
            '40000000-0000-4000-8000-000000000004',
            $1,
            'owner-invite@example.com',
            id,
            REPEAT('d', 64),
            $2,
            NOW() + INTERVAL '7 days'
          FROM roles
          WHERE scope = 'organization'
            AND key = 'owner'
            AND is_system = TRUE
        `,
        [organizationId, userIds[0]]
      )
    ).rejects.toThrow();

    // Organization invitations must not use project roles.
    await expect(
      migrationTestPool.query(
        `
          INSERT INTO invitations (
            id,
            organization_id,
            email,
            role_id,
            token_hash,
            invited_by,
            expires_at
          )
          SELECT
            '40000000-0000-4000-8000-000000000005',
            $1,
            'wrong-scope@example.com',
            id,
            REPEAT('e', 64),
            $2,
            NOW() + INTERVAL '7 days'
          FROM roles
          WHERE scope = 'project'
            AND key = 'developer'
            AND is_system = TRUE
        `,
        [organizationId, userIds[0]]
      )
    ).rejects.toThrow();

    // Project invitations must not use organization roles.
    await expect(
      migrationTestPool.query(
        `
          INSERT INTO invitations (
            id,
            organization_id,
            project_id,
            email,
            role_id,
            token_hash,
            invited_by,
            expires_at
          )
          SELECT
            '40000000-0000-4000-8000-000000000006',
            $1,
            $2,
            'wrong-project-scope@example.com',
            id,
            REPEAT('f', 64),
            $3,
            NOW() + INTERVAL '7 days'
          FROM roles
          WHERE scope = 'organization'
            AND key = 'member'
            AND is_system = TRUE
        `,
        [organizationId, projectId, userIds[0]]
      )
    ).rejects.toThrow();

    // Create another organization with a custom role.
    // That role must not be usable by invitations in this organization.
    const otherOrganizationId =
      "20000000-0000-4000-8000-000000000002";

    const otherCustomRoleId =
      "50000000-0000-4000-8000-000000000001";

    const organizationClient = await migrationTestPool.connect();

    try {
      await organizationClient.query("BEGIN");

      await organizationClient.query(
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
          otherOrganizationId,
          "Other Role Migration Test",
          "other-role-migration-test",
          userIds[1],
        ]
      );

      await organizationClient.query(
        `
      INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        status
      )
      VALUES ($1, $2, 'owner', 'active')
    `,
        [otherOrganizationId, userIds[1]]
      );

      await organizationClient.query(
        `
      INSERT INTO roles (
        id,
        organization_id,
        scope,
        key,
        name,
        is_system
      )
      VALUES (
        $1,
        $2,
        'organization',
        'custom_org_role',
        'Custom Organization Role',
        FALSE
      )
    `,
        [otherCustomRoleId, otherOrganizationId]
      );

      await organizationClient.query("COMMIT");
    } catch (error) {
      await organizationClient.query("ROLLBACK");
      throw error;
    } finally {
      organizationClient.release();
    }

    // A custom role cannot be used outside its owning organization.
    await expect(
      migrationTestPool.query(
        `
          INSERT INTO invitations (
            id,
            organization_id,
            email,
            role_id,
            token_hash,
            invited_by,
            expires_at
          )
          VALUES (
            '40000000-0000-4000-8000-000000000007',
            $1,
            'foreign-custom-role@example.com',
            $2,
            REPEAT('1', 64),
            $3,
            NOW() + INTERVAL '7 days'
          )
        `,
        [organizationId, otherCustomRoleId, userIds[0]]
      )
    ).rejects.toThrow();

    // An expired invitation must not block a new pending invitation
    // for the same organization and email address.
    await migrationTestPool.query(
      `
        INSERT INTO invitations (
          id,
          organization_id,
          email,
          role_id,
          token_hash,
          invited_by,
          expires_at
        )
        SELECT
          '40000000-0000-4000-8000-000000000008',
          $1,
          'expired-member@example.com',
          id,
          REPEAT('2', 64),
          $2,
          NOW() + INTERVAL '7 days'
        FROM roles
        WHERE scope = 'organization'
          AND key = 'member'
          AND is_system = TRUE
      `,
      [organizationId, userIds[0]]
    );

    const newPendingInvitation = await migrationTestPool.query<{
      status: string;
      email_delivery_status: string;
      email_delivery_attempts: number;
    }>(
      `
        SELECT
          status,
          email_delivery_status,
          email_delivery_attempts
        FROM invitations
        WHERE id = '40000000-0000-4000-8000-000000000008'
      `
    );

    expect(newPendingInvitation.rows[0]).toEqual({
      status: "pending",
      email_delivery_status: "pending",
      email_delivery_attempts: 0,
    });

    // Non-accepted invitations must not have acceptance metadata.
    await expect(
      migrationTestPool.query(
        `
          UPDATE invitations
          SET accepted_by = $1
          WHERE id = '40000000-0000-4000-8000-000000000002'
        `,
        [userIds[1]]
      )
    ).rejects.toThrow();

    // Accepted invitations must have both acceptance fields.
    await expect(
      migrationTestPool.query(
        `
          UPDATE invitations
          SET status = 'accepted'
          WHERE id = '40000000-0000-4000-8000-000000000003'
        `
      )
    ).rejects.toThrow();

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

    // Verify Migration 005 was recorded.
    const invitationMigrationResult =
      await migrationTestPool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM schema_migrations
          WHERE name = '005_create_invitation_foundation.sql'
        `
      );

    expect(invitationMigrationResult.rows[0].count).toBe("1");

    const migration005 = migrationStatus.find(
      (migration) =>
        migration.name ===
        "005_create_invitation_foundation.sql"
    );

    expect(migration005?.status).toBe("EXECUTED");

    // Verify Migration 006 was recorded.
    const migration006Result =
      await migrationTestPool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM schema_migrations
          WHERE name = '006_enforce_pending_invitation_uniqueness.sql'
        `
      );

    expect(migration006Result.rows[0].count).toBe("1");

    const migration006 = migrationStatus.find(
      (migration) =>
        migration.name ===
        "006_enforce_pending_invitation_uniqueness.sql"
    );

    expect(migration006?.status).toBe("EXECUTED");

    // Verify Migration 007 was recorded.
    const migration007Result =
      await migrationTestPool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM schema_migrations
          WHERE name = '007_remove_redundant_invitation_indexes.sql'
        `
      );

    expect(migration007Result.rows[0].count).toBe("1");

    const migration007 = migrationStatus.find(
      (migration) =>
        migration.name ===
        "007_remove_redundant_invitation_indexes.sql"
    );

    expect(migration007?.status).toBe("EXECUTED");

    // Verify Migration 008 was recorded.
    const migration008Result =
      await migrationTestPool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM schema_migrations
          WHERE name = '008_track_invitation_delivery_attempts.sql'
        `
      );

    expect(migration008Result.rows[0].count).toBe("1");

    const migration008 = migrationStatus.find(
      (migration) =>
        migration.name ===
        "008_track_invitation_delivery_attempts.sql"
    );

    expect(migration008?.status).toBe("EXECUTED");

    // Verify the delivery-attempt columns and their types.
    const deliveryColumns = await migrationTestPool.query<{
      column_name: string;
      data_type: string;
    }>(
      `
        SELECT
          column_name,
          data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invitations'
          AND column_name IN (
            'email_delivery_attempt_id',
            'email_delivery_started_at'
          )
        ORDER BY column_name
      `
    );

    expect(deliveryColumns.rows).toEqual([
      {
        column_name: "email_delivery_attempt_id",
        data_type: "uuid",
      },
      {
        column_name: "email_delivery_started_at",
        data_type: "timestamp with time zone",
      },
    ]);

    // Verify the delivery-attempt constraint exists.
    const deliveryConstraint = await migrationTestPool.query<{
      constraint_name: string;
    }>(
      `
        SELECT conname AS constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.invitations'::regclass
          AND conname =
            'invitations_delivery_attempt_state_check'
      `
    );

    expect(deliveryConstraint.rows).toEqual([
      {
        constraint_name:
          "invitations_delivery_attempt_state_check",
      },
    ]);

    // Verify the constraint permits a valid active delivery attempt
    // and rejects an active attempt on a revoked invitation.
    const constraintTestClient =
      await migrationTestPool.connect();

    try {
      await constraintTestClient.query("BEGIN");

      const fixtureInvitationId =
        "40000000-0000-4000-8000-000000000002";

      await constraintTestClient.query(
        `
          UPDATE invitations
          SET
            email = 'migration-008-constraint-test@example.com',
            status = 'pending',
            expires_at = NOW() + INTERVAL '7 days',
            email_delivery_attempt_id =
              '50000000-0000-4000-8000-000000000001',
            email_delivery_started_at = NOW()
          WHERE id = $1
        `,
        [fixtureInvitationId]
      );

      const validAttempt =
        await constraintTestClient.query<{
          email_delivery_attempt_id: string | null;
        }>(
          `
            SELECT email_delivery_attempt_id
            FROM invitations
            WHERE id = $1
          `,
          [fixtureInvitationId]
        );

      expect(
        validAttempt.rows[0]?.email_delivery_attempt_id
      ).toBe("50000000-0000-4000-8000-000000000001");

      await constraintTestClient.query(
        "SAVEPOINT invalid_delivery_state"
      );

      await expect(
        constraintTestClient.query(
          `
            UPDATE invitations
            SET status = 'revoked'
            WHERE id = $1
          `,
          [fixtureInvitationId]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "invitations_delivery_attempt_state_check",
      });

      await constraintTestClient.query(
        "ROLLBACK TO SAVEPOINT invalid_delivery_state"
      );

      await constraintTestClient.query("ROLLBACK");
    } catch (error) {
      await constraintTestClient.query("ROLLBACK");
      throw error;
    } finally {
      constraintTestClient.release();
    }

    // Verify the original unique indexes from Migration 003 remain.
    // Verify the redundant indexes from Migration 006 were removed.
    const invitationIndexes = await migrationTestPool.query<{
      indexname: string;
      is_unique: boolean;
    }>(
      `
        SELECT
          index_class.relname AS indexname,
          index_info.indisunique AS is_unique
        FROM pg_index index_info
        JOIN pg_class index_class
          ON index_class.oid = index_info.indexrelid
        JOIN pg_namespace index_schema
          ON index_schema.oid = index_class.relnamespace
        WHERE index_schema.nspname = 'public'
          AND index_class.relname IN (
            'idx_invitations_pending_organization_email',
            'idx_invitations_pending_project_email',
            'idx_invitations_unique_pending_organization_email',
            'idx_invitations_unique_pending_project_email'
          )
      `
    );

    expect(invitationIndexes.rows).toHaveLength(2);

    expect(invitationIndexes.rows).toEqual(
      expect.arrayContaining([
        {
          indexname:
            "idx_invitations_pending_organization_email",
          is_unique: true,
        },
        {
          indexname:
            "idx_invitations_pending_project_email",
          is_unique: true,
        },
      ])
    );

    expect(invitationIndexes.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname:
            "idx_invitations_unique_pending_organization_email",
        }),
        expect.objectContaining({
          indexname:
            "idx_invitations_unique_pending_project_email",
        }),
      ])
    );
  });

  it("should enforce exactly one active project owner at the database level", async () => {
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

    // Verify the project owner invariant at the database level.
    const expectOwnerConstraintFailure = async (
      statement: string,
      values: unknown[] = []
    ): Promise<void> => {
      const constraintClient = await migrationTestPool.connect();

      try {
        await constraintClient.query("BEGIN");
        await constraintClient.query(statement, values);

        await expect(
          constraintClient.query("COMMIT")
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "project_members_exactly_one_active_owner",
        });
      } finally {
        await constraintClient.query("ROLLBACK").catch(() => undefined);
        constraintClient.release();
      }
    };

    // An owner cannot be suspended.
    await expectOwnerConstraintFailure(
      `
        UPDATE project_members
        SET status = 'suspended'
        WHERE project_id = $1
          AND user_id = $2
      `,
      [projectId, userIds[0]]
    );

    // An owner cannot be deleted.
    await expectOwnerConstraintFailure(
      `
        DELETE FROM project_members
        WHERE project_id = $1
          AND user_id = $2
      `,
      [projectId, userIds[0]]
    );

    // An owner cannot be demoted.
    await expectOwnerConstraintFailure(
      `
        UPDATE project_members
        SET role = 'project_manager'
        WHERE project_id = $1
          AND user_id = $2
      `,
      [projectId, userIds[0]]
    );

    // The partial unique index rejects a second owner immediately.
    const duplicateOwnerClient = await migrationTestPool.connect();

    try {
      await duplicateOwnerClient.query("BEGIN");

      await expect(
        duplicateOwnerClient.query(
          `
            UPDATE project_members
            SET role = 'project_owner'
            WHERE project_id = $1
              AND user_id = $2
          `,
          [projectId, userIds[1]]
        )
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "project_members_one_owner_per_project",
      });

      await duplicateOwnerClient.query("ROLLBACK");
    } finally {
      duplicateOwnerClient.release();
    }

    // Creating a project without an owner must fail at commit.
    const ownerlessProjectId =
      "30000000-0000-4000-8000-000000000002";

    await expectOwnerConstraintFailure(
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
        ownerlessProjectId,
        organizationId,
        "Ownerless Project",
        userIds[0],
      ]
    );

    // Project creation with an owner in the same transaction succeeds.
    const validProjectId =
      "30000000-0000-4000-8000-000000000003";

    const projectCreationClient = await migrationTestPool.connect();

    try {
      await projectCreationClient.query("BEGIN");

      await projectCreationClient.query(
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
          validProjectId,
          organizationId,
          "Valid Owner Project",
          userIds[0],
        ]
      );

      await projectCreationClient.query(
        `
          INSERT INTO project_members (
            project_id,
            organization_id,
            user_id,
            role,
            status
          )
          VALUES ($1, $2, $3, 'project_owner', 'active')
        `,
        [validProjectId, organizationId, userIds[0]]
      );

      await projectCreationClient.query("COMMIT");
    } catch (error) {
      await projectCreationClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      projectCreationClient.release();
    }

    // A valid ownership transfer may temporarily have zero owners,
    // provided the transaction finishes with exactly one active owner.
    const transferClient = await migrationTestPool.connect();

    try {
      await transferClient.query("BEGIN");

      await transferClient.query(
        `
          UPDATE project_members
          SET role = 'project_manager'
          WHERE project_id = $1
            AND user_id = $2
        `,
        [projectId, userIds[0]]
      );

      await transferClient.query(
        `
          UPDATE project_members
          SET role = 'project_owner'
          WHERE project_id = $1
            AND user_id = $2
        `,
        [projectId, userIds[1]]
      );

      await transferClient.query("COMMIT");
    } catch (error) {
      await transferClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      transferClient.release();
    }

    const finalOwners = await migrationTestPool.query<{
      user_id: string;
      role: string;
      status: string;
    }>(
      `
        SELECT user_id, role, status
        FROM project_members
        WHERE project_id = $1
          AND role = 'project_owner'
      `,
      [projectId]
    );

    expect(finalOwners.rows).toEqual([
      {
        user_id: userIds[1],
        role: "project_owner",
        status: "active",
      },
    ]);
  });

  it("should preserve the single-owner invariant during concurrent ownership transfers", async () => {
    const projectId =
      "30000000-0000-4000-8000-000000000001";

    const currentOwnerId =
      "10000000-0000-4000-8000-000000000002";

    const candidateOwnerIds = [
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
    ];

    const attemptTransfer = async (
      newOwnerId: string
    ): Promise<void> => {
      const client = await migrationTestPool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `
          UPDATE project_members
          SET role = 'project_manager'
          WHERE project_id = $1
            AND user_id = $2
        `,
          [projectId, currentOwnerId]
        );

        await client.query(
          `
          UPDATE project_members
          SET role = 'project_owner'
          WHERE project_id = $1
            AND user_id = $2
        `,
          [projectId, newOwnerId]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    };

    const results = await Promise.allSettled(
      candidateOwnerIds.map(attemptTransfer)
    );

    const successfulTransfers = results.filter(
      (result) => result.status === "fulfilled"
    );

    const failedTransfers = results.filter(
      (result) => result.status === "rejected"
    );

    expect(successfulTransfers).toHaveLength(1);
    expect(failedTransfers).toHaveLength(1);

    const owners = await migrationTestPool.query<{
      user_id: string;
      role: string;
      status: string;
    }>(
      `
      SELECT user_id, role, status
      FROM project_members
      WHERE project_id = $1
        AND role = 'project_owner'
    `,
      [projectId]
    );

    expect(owners.rows).toHaveLength(1);
    expect(owners.rows[0]?.role).toBe("project_owner");
    expect(owners.rows[0]?.status).toBe("active");
    expect(candidateOwnerIds).toContain(owners.rows[0]?.user_id);
  });
});
