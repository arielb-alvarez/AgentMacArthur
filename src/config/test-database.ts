import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const testPool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_TEST_NAME,
  max: 5,
  connectionTimeoutMillis: 5000,
});

export const connectTestDatabase = async (): Promise<void> => {
  const result = await testPool.query("SELECT current_database()");

  console.log("Connected to test database:", result.rows[0].current_database);
};