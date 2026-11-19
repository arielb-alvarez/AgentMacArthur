import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";

import type { PoolClient } from "pg";

import { ConversationService } from "../../src/conversations/conversation.service.js";

import type { ConversationRepository } from "../../src/conversations/conversation.repository.js";
import type { TransactionManager } from "../../src/database/transaction-manager.js";
import type { ConversationAccessService } from "../../src/conversations/conversation-access.service.js";

import type {
  Conversation,
  ConversationMessage,
} from "../../src/conversations/conversation.types.js";

describe("ConversationService", () => {
  let repository: ConversationRepository;
  let transactionManager: TransactionManager;
  let accessService: ConversationAccessService;
  let conversationService: ConversationService;

  let mockConversation: Conversation;
  let client: PoolClient;

  const userId = "authenticated-user-id";

  beforeEach(() => {
    vi.clearAllMocks();

    client = {} as PoolClient;

    mockConversation = {
      id: "test-conversation-id",
      createdBy: userId,
      scope: "personal",
      organizationId: null,
      projectId: null,
      title: null,
      status: "active",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    repository = {
      create: vi.fn().mockResolvedValue(mockConversation),
      findById: vi.fn().mockResolvedValue(mockConversation),
      findByIdForUpdate: vi.fn().mockResolvedValue(mockConversation),
      addMessage: vi.fn().mockResolvedValue(mockConversation),
    };

    transactionManager = {
      runInTransaction: vi.fn().mockImplementation(
        async (
          _operationName: string,
          callback: (client: PoolClient) => Promise<unknown>
        ) => callback(client)
      ),
    } as unknown as TransactionManager;

    accessService = {
      assertAccess: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConversationAccessService;

    conversationService = new ConversationService(
      repository,
      transactionManager,
      accessService
    );
  });

  describe("startTurn", () => {
    it("creates and authorizes a personal conversation", async () => {
      const message: ConversationMessage = {
        role: "user",
        content: "Hello",
      };

      await conversationService.startTurn(
        userId,
        {
          createdBy: "untrusted-client-user",
          scope: "personal",
        },
        message
      );

      expect(repository.create).toHaveBeenCalledWith(
        {
          createdBy: userId,
          scope: "personal",
        },
        client
      );

      expect(accessService.assertAccess).toHaveBeenCalledWith(
        mockConversation,
        userId,
        "participate",
        client
      );

      expect(repository.addMessage).toHaveBeenCalledWith(
        mockConversation.id,
        message,
        client
      );
    });

    it("creates an organization conversation with the requested organization", async () => {
      const message: ConversationMessage = {
        role: "user",
        content: "Organization question",
      };

      await conversationService.startTurn(
        userId,
        {
          createdBy: "untrusted-client-user",
          scope: "organization",
          organizationId: "organization-123",
        },
        message
      );

      expect(repository.create).toHaveBeenCalledWith(
        {
          createdBy: userId,
          scope: "organization",
          organizationId: "organization-123",
        },
        client
      );
    });

    it("creates a project conversation with the requested organization and project", async () => {
      const message: ConversationMessage = {
        role: "user",
        content: "Project question",
      };

      await conversationService.startTurn(
        userId,
        {
          createdBy: "untrusted-client-user",
          scope: "project",
          organizationId: "organization-123",
          projectId: "project-123",
        },
        message
      );

      expect(repository.create).toHaveBeenCalledWith(
        {
          createdBy: userId,
          scope: "project",
          organizationId: "organization-123",
          projectId: "project-123",
        },
        client
      );
    });

    it("locks an existing conversation before authorization", async () => {
      const message: ConversationMessage = {
        role: "user",
        content: "Continue conversation",
      };

      const events: string[] = [];

      vi.mocked(repository.findByIdForUpdate).mockImplementation(
        async () => {
          events.push("lock");
          return mockConversation;
        }
      );

      vi.mocked(accessService.assertAccess).mockImplementation(
        async () => {
          events.push("authorize");
        }
      );

      vi.mocked(repository.addMessage).mockImplementation(
        async () => {
          events.push("add-message");
          return mockConversation;
        }
      );

      await conversationService.startTurn(
        userId,
        {
          conversationId: mockConversation.id,
        },
        message
      );

      expect(repository.findByIdForUpdate).toHaveBeenCalledWith(
        mockConversation.id,
        client
      );

      expect(events).toEqual([
        "lock",
        "authorize",
        "add-message",
      ]);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it("does not insert a message when authorization fails", async () => {
      const authorizationError = new Error("Forbidden");

      vi.mocked(accessService.assertAccess).mockRejectedValue(
        authorizationError
      );

      await expect(
        conversationService.startTurn(
          userId,
          {
            conversationId: mockConversation.id,
          },
          {
            role: "user",
            content: "Unauthorized message",
          }
        )
      ).rejects.toBe(authorizationError);

      expect(repository.addMessage).not.toHaveBeenCalled();
    });

    it("throws 404 when an existing conversation does not exist", async () => {
      vi.mocked(repository.findByIdForUpdate).mockResolvedValue(
        undefined
      );

      await expect(
        conversationService.startTurn(
          userId,
          {
            conversationId: "missing-conversation",
          },
          {
            role: "user",
            content: "Hello",
          }
        )
      ).rejects.toMatchObject({
        message: "Conversation not found.",
        statusCode: 404,
      });

      expect(accessService.assertAccess).not.toHaveBeenCalled();
      expect(repository.addMessage).not.toHaveBeenCalled();
    });

    it("uses a transaction for the entire start-turn operation", async () => {
      await conversationService.startTurn(
        userId,
        {
          conversationId: mockConversation.id,
        },
        {
          role: "user",
          content: "Hello",
        }
      );

      expect(transactionManager.runInTransaction).toHaveBeenCalledWith(
        "conversation.startTurn",
        expect.any(Function)
      );
    });
  });

  describe("completeTurn", () => {
    it("locks and reauthorizes the conversation before saving the assistant response", async () => {
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: "Hello from AgentMacArthur",
      };

      const events: string[] = [];

      vi.mocked(repository.findByIdForUpdate).mockImplementation(
        async () => {
          events.push("lock");
          return mockConversation;
        }
      );

      vi.mocked(accessService.assertAccess).mockImplementation(
        async () => {
          events.push("reauthorize");
        }
      );

      vi.mocked(repository.addMessage).mockImplementation(
        async () => {
          events.push("save-assistant");
          return mockConversation;
        }
      );

      await conversationService.completeTurn(
        mockConversation.id,
        userId,
        assistantMessage
      );

      expect(events).toEqual([
        "lock",
        "reauthorize",
        "save-assistant",
      ]);

      expect(accessService.assertAccess).toHaveBeenCalledWith(
        mockConversation,
        userId,
        "participate",
        client
      );

      expect(repository.addMessage).toHaveBeenCalledWith(
        mockConversation.id,
        assistantMessage,
        client
      );
    });

    it("does not save the assistant response if permission was revoked", async () => {
      const authorizationError = new Error("Permission revoked");

      vi.mocked(accessService.assertAccess).mockRejectedValue(
        authorizationError
      );

      await expect(
        conversationService.completeTurn(
          mockConversation.id,
          userId,
          {
            role: "assistant",
            content: "AI response",
          }
        )
      ).rejects.toBe(authorizationError);

      expect(repository.addMessage).not.toHaveBeenCalled();
    });

    it("throws 404 when the conversation no longer exists", async () => {
      vi.mocked(repository.findByIdForUpdate).mockResolvedValue(
        undefined
      );

      await expect(
        conversationService.completeTurn(
          mockConversation.id,
          userId,
          {
            role: "assistant",
            content: "AI response",
          }
        )
      ).rejects.toMatchObject({
        message: "Conversation not found.",
        statusCode: 404,
      });

      expect(accessService.assertAccess).not.toHaveBeenCalled();
      expect(repository.addMessage).not.toHaveBeenCalled();
    });

    it("uses a separate transaction for completing the turn", async () => {
      await conversationService.completeTurn(
        mockConversation.id,
        userId,
        {
          role: "assistant",
          content: "AI response",
        }
      );

      expect(transactionManager.runInTransaction).toHaveBeenCalledWith(
        "conversation.completeTurn",
        expect.any(Function)
      );
    });
  });
});
