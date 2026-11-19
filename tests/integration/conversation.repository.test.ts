import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { randomUUID } from "node:crypto";

import { testPool } from "../../src/config/test-database.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";
import { PostgresConversationRepository } from "../../src/conversations/postgres-conversation.repository.js";

import {
  clearIdentityTestDatabase,
  clearTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import type {
  CreateConversationInput,
  ConversationMessage,
} from "../../src/conversations/conversation.types.js";

describe("PostgresConversationRepository integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);
  const repository = new PostgresConversationRepository();

  let userId: string;
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    // Conversations reference users and tenant records.
    // Delete conversations before clearing identity fixtures.
    await clearTestDatabase();
    await clearIdentityTestDatabase();

    userId = randomUUID();
    organizationId = randomUUID();
    projectId = randomUUID();

    await createUser(userId);
    await createOrganization(organizationId, userId);
    await createProject(projectId, organizationId, userId);
  });

  afterAll(async () => {
    await testPool.end();
  });

  const createUser = async (id: string): Promise<void> => {
    await testPool.query(
      `INSERT INTO users (
        id,
        email,
        password_hash,
        display_name,
        status
      )
      VALUES ($1, $2, $3, $4, 'active')`,
      [
        id,
        `${id}@example.com`,
        "test-password-hash",
        "Conversation Test User",
      ]
    );
  };

  const createOrganization = async (
    id: string,
    ownerUserId: string
  ): Promise<void> => {
    await transactionManager.runInTransaction(
      "createConversationTestOrganization",
      async (client) => {
        await client.query(
          `INSERT INTO organizations (
            id,
            name,
            slug,
            type,
            owner_user_id
          )
          VALUES ($1, $2, $3, 'team', $4)`,
          [
            id,
            "Conversation Test Organization",
            `conversation-${id}`,
            ownerUserId,
          ]
        );

        await client.query(
          `INSERT INTO organization_members (
            organization_id,
            user_id,
            role,
            status
          )
          VALUES ($1, $2, 'owner', 'active')`,
          [id, ownerUserId]
        );
      }
    );
  };

  const createProject = async (
    id: string,
    organizationId: string,
    createdBy: string
  ): Promise<void> => {
    await transactionManager.runInTransaction(
      "createConversationTestProject",
      async (client) => {
        await client.query(
          `INSERT INTO projects (
            id,
            organization_id,
            name,
            description,
            status,
            created_by
          )
          VALUES ($1, $2, $3, $4, 'draft', $5)`,
          [
            id,
            organizationId,
            "Conversation Test Project",
            "Repository integration test",
            createdBy,
          ]
        );

        await client.query(
          `INSERT INTO project_members (
            project_id,
            organization_id,
            user_id,
            role,
            status
          )
          VALUES ($1, $2, $3, 'project_owner', 'active')`,
          [id, organizationId, createdBy]
        );

        await client.query(
          `INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT $1, $2, $3, r.id, $4
          FROM roles r
          WHERE r.scope = 'project'
            AND r.key = 'project_owner'
            AND r.is_system = TRUE`,
          [id, organizationId, createdBy, createdBy]
        );
      }
    );
  };

  const createConversation = async (
    input: CreateConversationInput
  ) => {
    return transactionManager.runInTransaction(
      "createTestConversation",
      (client) => repository.create(input, client)
    );
  };

  const findConversation = async (id: string) => {
    return transactionManager.runInTransaction(
      "findTestConversation",
      (client) => repository.findById(id, client)
    );
  };

  const addMessage = async (
    conversationId: string,
    message: ConversationMessage
  ) => {
    return transactionManager.runInTransaction(
      "addTestConversationMessage",
      (client) => repository.addMessage(conversationId, message, client)
    );
  };

  it("creates a personal conversation", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    expect(conversation.id).toBeDefined();
    expect(conversation.createdBy).toBe(userId);
    expect(conversation.scope).toBe("personal");
    expect(conversation.organizationId).toBeNull();
    expect(conversation.projectId).toBeNull();
    expect(conversation.status).toBe("active");
    expect(conversation.messages).toEqual([]);
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(conversation.updatedAt).toBeInstanceOf(Date);
  });

  it("creates an organization conversation", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "organization",
      organizationId,
    });

    expect(conversation.createdBy).toBe(userId);
    expect(conversation.scope).toBe("organization");
    expect(conversation.organizationId).toBe(organizationId);
    expect(conversation.projectId).toBeNull();
    expect(conversation.status).toBe("active");
  });

  it("creates a project conversation", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "project",
      organizationId,
      projectId,
    });

    expect(conversation.createdBy).toBe(userId);
    expect(conversation.scope).toBe("project");
    expect(conversation.organizationId).toBe(organizationId);
    expect(conversation.projectId).toBe(projectId);
    expect(conversation.status).toBe("active");
  });

  it("retrieves an existing conversation with its scope metadata", async () => {
    const created = await createConversation({
      createdBy: userId,
      scope: "project",
      organizationId,
      projectId,
    });

    const conversation = await findConversation(created.id);

    expect(conversation).toBeDefined();
    expect(conversation?.id).toBe(created.id);
    expect(conversation?.createdBy).toBe(userId);
    expect(conversation?.scope).toBe("project");
    expect(conversation?.organizationId).toBe(organizationId);
    expect(conversation?.projectId).toBe(projectId);
  });

  it("returns undefined for a nonexistent conversation", async () => {
    const conversation = await findConversation(
      randomUUID()
    );

    expect(conversation).toBeUndefined();
  });

  it("locks an existing conversation for update", async () => {
    const created = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    const locked = await transactionManager.runInTransaction(
      "lockTestConversation",
      async (client) => {
        return repository.findByIdForUpdate(created.id, client);
      }
    );

    expect(locked?.id).toBe(created.id);
    expect(locked?.createdBy).toBe(userId);
  });

  it("persists messages in a conversation", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    const message: ConversationMessage = {
      role: "user",
      content: "Hello AgentMacArthur",
    };

    await addMessage(conversation.id, message);

    const retrieved = await findConversation(conversation.id);

    expect(retrieved?.messages).toEqual([message]);
  });

  it("returns the complete updated conversation after adding messages", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    const firstMessage: ConversationMessage = {
      role: "user",
      content: "First message",
    };

    const secondMessage: ConversationMessage = {
      role: "assistant",
      content: "Second message",
    };

    await addMessage(conversation.id, firstMessage);

    const updated = await addMessage(
      conversation.id,
      secondMessage
    );

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(conversation.id);
    expect(updated?.messages).toEqual([
      firstMessage,
      secondMessage,
    ]);
    expect(updated?.createdAt).toBeInstanceOf(Date);
    expect(updated?.updatedAt).toBeInstanceOf(Date);
  });

  it("returns undefined when adding a message to a nonexistent conversation", async () => {
    const result = await addMessage(
      randomUUID(),
      {
        role: "user",
        content: "This should not be saved",
      }
    );

    expect(result).toBeUndefined();
  });

  it("preserves message order", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    const messages: ConversationMessage[] = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "Second message" },
      { role: "user", content: "Third message" },
    ];

    for (const message of messages) {
      await addMessage(conversation.id, message);
    }

    const retrieved = await findConversation(conversation.id);

    expect(
      retrieved?.messages.map((message) => message.content)
    ).toEqual([
      "First message",
      "Second message",
      "Third message",
    ]);
  });

  it("rejects a conversation with a nonexistent creator", async () => {
    await expect(
      createConversation({
        createdBy: randomUUID(),
        scope: "personal",
      })
    ).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("rejects an organization conversation with a nonexistent organization", async () => {
    await expect(
      createConversation({
        createdBy: userId,
        scope: "organization",
        organizationId: randomUUID(),
      })
    ).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("rejects a project conversation with a mismatched organization", async () => {
    await expect(
      createConversation({
        createdBy: userId,
        scope: "project",
        organizationId: randomUUID(),
        projectId,
      })
    ).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("rejects changes to conversation ownership and scope", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    await expect(
      testPool.query(
        `UPDATE conversations
         SET scope = 'organization',
             organization_id = $2
         WHERE id = $1`,
        [conversation.id, organizationId]
      )
    ).rejects.toThrow(
      "Conversation ownership and scope cannot be changed."
    );
  });

  it("rolls back a message insertion when its transaction fails", async () => {
    const conversation = await createConversation({
      createdBy: userId,
      scope: "personal",
    });

    await expect(
      transactionManager.runInTransaction(
        "testConversationRollback",
        async (client) => {
          await repository.addMessage(
            conversation.id,
            {
              role: "user",
              content: "This must roll back",
            },
            client
          );

          throw new Error("Force transaction rollback");
        }
      )
    ).rejects.toThrow("Force transaction rollback");

    const retrieved = await findConversation(conversation.id);

    expect(retrieved?.messages).toEqual([]);
  });
});
