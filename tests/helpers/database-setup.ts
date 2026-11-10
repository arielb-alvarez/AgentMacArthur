import { testPool } from "../../src/config/test-database.js";

export const setupTestDatabase = async (): Promise<void> => {
  await testPool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await testPool.query(`
    ALTER TABLE conversation_messages
    ADD COLUMN IF NOT EXISTS message_order BIGINT
    GENERATED ALWAYS AS IDENTITY;
  `);

  await testPool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id UUID PRIMARY KEY,
      message_order BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
      conversation_id UUID NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL
        CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await testPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_message_order
    ON conversation_messages(message_order);
  `);
};

export const clearTestDatabase = async (): Promise<void> => {
  await testPool.query("TRUNCATE TABLE conversation_messages, conversations CASCADE");
};