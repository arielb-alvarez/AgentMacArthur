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
export const clearIdentityTestDatabase = async (): Promise<void> => {
  await testPool.query(`
    TRUNCATE TABLE users CASCADE
  `);
};
