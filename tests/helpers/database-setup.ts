import { testPool } from "../../src/config/test-database.js";
import { runMigrations } from "../../src/database/migration.runner.js";

export const setupTestDatabase = async (): Promise<void> => {
  const result = await testPool.query<{
    database_name: string;
  }>("SELECT current_database() AS database_name");

  if (result.rows[0]?.database_name !== process.env.DB_TEST_NAME) {
    throw new Error(
      "Refusing to run test migrations against an unexpected database."
    );
  }

  await runMigrations(testPool);
};

// Conversation repository tests only.
export const clearTestDatabase = async (): Promise<void> => {
  await testPool.query(`
    TRUNCATE TABLE
      conversation_messages,
      conversations
    CASCADE
  `);
};

// User and identity repository tests only.
// Preserve platform-level roles, permissions, and role-permission mappings.
export const clearIdentityTestDatabase = async (): Promise<void> => {
  const client = await testPool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM invitations");
    await client.query("DELETE FROM project_member_roles");
    await client.query("DELETE FROM organization_member_roles");

    await client.query("DELETE FROM project_members");
    await client.query("DELETE FROM projects");

    // Custom roles belong to organizations and are test data.
    // Built-in system roles are preserved.
    await client.query("DELETE FROM roles WHERE is_system = FALSE");

    // The organization owner-membership constraint is deferred.
    // Both sides of that relationship are removed in this transaction.
    await client.query("DELETE FROM organization_members");
    await client.query("DELETE FROM organizations");

    await client.query("DELETE FROM users");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
