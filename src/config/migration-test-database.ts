import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const migrationTestPool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_MIGRATION_TEST_NAME,
  max: 5,
  connectionTimeoutMillis: 5000,
});

export const connectMigrationTestDatabase =
  async (): Promise<void> => {
    const result = await migrationTestPool.query(
      "SELECT current_database()"
    );

    console.log(
      "Connected to migration test database:",
      result.rows[0].current_database
    );
  };
