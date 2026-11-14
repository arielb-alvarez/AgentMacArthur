import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { logger } from "../../src/utils/logger.js";
import { testPool } from "../../src/config/test-database.js";
import { PostgresConversationRepository } from "../../src/conversations/postgres-conversation.repository.js";

import {
  clearTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

describe("PostgresConversationRepository", () => {
  const repository = new PostgresConversationRepository(testPool);

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a conversation", async () => {
    const conversation = await repository.create();

    expect(conversation.id).toBeDefined();
    expect(conversation.messages).toEqual([]);
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(conversation.updatedAt).toBeInstanceOf(Date);
  });

  it("retrieves an existing conversation", async () => {
    const created = await repository.create();

    const conversation = await repository.findById(created.id);

    expect(conversation).toBeDefined();
    expect(conversation?.id).toBe(created.id);
  });

  it("returns undefined for a nonexistent conversation", async () => {
    const conversation = await repository.findById(
      "00000000-0000-4000-8000-000000000000"
    );

    expect(conversation).toBeUndefined();
  });

  it("persists messages in a conversation", async () => {
    const conversation = await repository.create();

    await repository.addMessage(conversation.id, {
      role: "user",
      content: "Hello AgentMacArthur",
    });

    const retrieved = await repository.findById(conversation.id);

    expect(retrieved?.messages).toHaveLength(1);
    expect(retrieved?.messages[0]).toEqual({
      role: "user",
      content: "Hello AgentMacArthur",
    });
  });


  it("returns the complete updated conversation after adding a message", async () => {
    const conversation = await repository.create();

    await repository.addMessage(conversation.id, {
      role: "user",
      content: "First message",
    });

    const updated = await repository.addMessage(conversation.id, {
      role: "assistant",
      content: "Second message",
    });

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(conversation.id);
    expect(updated?.messages).toEqual([
      {
        role: "user",
        content: "First message",
      },
      {
        role: "assistant",
        content: "Second message",
      },
    ]);
    expect(updated?.createdAt).toBeInstanceOf(Date);
    expect(updated?.updatedAt).toBeInstanceOf(Date);
  });

  it("returns undefined when adding a message to a nonexistent conversation", async () => {
    const result = await repository.addMessage(
      "00000000-0000-4000-8000-000000000000",
      {
        role: "user",
        content: "This should not be saved",
      }
    );

    expect(result).toBeUndefined();
  });


  it("preserves message order in a conversation", async () => {
    const conversation = await repository.create();

    await repository.addMessage(conversation.id, {
      role: "user",
      content: "First message",
    });

    await repository.addMessage(conversation.id, {
      role: "assistant",
      content: "Second message",
    });

    await repository.addMessage(conversation.id, {
      role: "user",
      content: "Third message",
    });

    const retrieved = await repository.findById(conversation.id);

    expect(retrieved?.messages.map((message) => message.content)).toEqual([
      "First message",
      "Second message",
      "Third message",
    ]);
  });

  it("logs a warning for slow database operations", async () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => { });

    const monitoredRepository = new PostgresConversationRepository(
      testPool,
      undefined,
      1
    );

    await monitoredRepository.create();

    expect(warnSpy).toHaveBeenCalledWith(
      "Slow database operation detected",
      expect.objectContaining({
        operation: "create",
        thresholdMs: 1,
        durationMs: expect.any(Number),
      })
    );
  });

  it("does not log a warning for operations below the threshold", async () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => { });

    const monitoredRepository = new PostgresConversationRepository(
      testPool,
      undefined,
      300000
    );

    await monitoredRepository.create();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("cancels a query that exceeds the configured timeout", async () => {
    const conversation = await repository.create();

    const blocker = await testPool.connect();

    const shortTimeoutRepository = new PostgresConversationRepository(
      testPool,
      100
    );

    try {
      // Hold a row lock so the repository's UPDATE must wait.
      await blocker.query("BEGIN");

      await blocker.query(
        `UPDATE conversations
        SET updated_at = NOW()
        WHERE id = $1`,
        [conversation.id]
      );

      // PostgreSQL should cancel the waiting query after 100 ms.
      await expect(
        shortTimeoutRepository.addMessage(conversation.id, {
          role: "user",
          content: "This query should time out",
        })
      ).rejects.toMatchObject({
        code: "57014",
      });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }

    // Confirm the failed transaction did not save a message
    // and the repository can still use the connection pool.
    const retrieved = await repository.findById(conversation.id);

    expect(retrieved?.messages).toHaveLength(0);
  });
});