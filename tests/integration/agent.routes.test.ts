import express, { type RequestHandler } from "express";
import request from "supertest";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import { env } from "../../src/config/env.js";

import {
  setupTestDatabase,
  clearTestDatabase,
  clearIdentityTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresSessionRepository } from "../../src/sessions/postgres-session.repository.js";

import { TokenService } from "../../src/auth/token.service.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { AuthService } from "../../src/auth/auth.service.js";

import { createAuthenticationMiddleware } from "../../src/middleware/auth.middleware.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";
import { createRateLimiters } from "../../src/middleware/rate-limit.middleware.js";

import { PostgresConversationRepository } from "../../src/conversations/postgres-conversation.repository.js";
import { ConversationService } from "../../src/conversations/conversation.service.js";
import { ConversationAccessService } from "../../src/conversations/conversation-access.service.js";

import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

import { AgentChatService } from "../../src/agent/agent-chat.service.js";
import { mockAgentProvider } from "../../src/services/mock-agent.service.js";

import { createAgentController } from "../../src/controllers/agent.controller.js";
import { createAgentRouter } from "../../src/routes/agent.routes.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session-cookie.js";

describe("POST /api/agent/chat", () => {
  const transactionManager =
    new PostgresTransactionManager(testPool);

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const sessionRepository = new PostgresSessionRepository(
    testPool,
    transactionManager
  );

  const tokenService = new TokenService();

  const authService = new AuthService(
    userRepository,
    sessionRepository,
    new PasswordService(),
    tokenService,
    transactionManager
  );

  const authentication =
    createAuthenticationMiddleware(authService);

  const conversationRepository =
    new PostgresConversationRepository();

  const permissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const permissionService =
    new OrganizationPermissionService(permissionRepository);

  const accessService =
    new ConversationAccessService(permissionService);

  const conversationService = new ConversationService(
    conversationRepository,
    transactionManager,
    accessService
  );

  const agentChatService = new AgentChatService(
    mockAgentProvider,
    conversationService
  );

  const controller = createAgentController(agentChatService);

  const { chatRateLimiter } = createRateLimiters({
    windowMs: 60_000,
    apiLimit: 100,
    chatLimit: 100,
  });

  let injectedRateLimiterCalls = 0;

  const injectedRateLimiter: RequestHandler = (
    req,
    res,
    next
  ) => {
    injectedRateLimiterCalls += 1;
    return chatRateLimiter(req, res, next);
  };

  const app = express();

  app.use(express.json());

  app.use(
    "/api/agent",
    createAgentRouter(
      controller,
      authentication,
      injectedRateLimiter
    )
  );

  app.use(errorMiddleware);

  const allowedOrigin = env.CORS_ORIGINS[0];

  let userId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await clearIdentityTestDatabase();

    const user = await userRepository.create({
      email: "agent-route-test@example.com",
      passwordHash: "test-password-hash",
      displayName: "Agent Route Test",
    });

    const verifiedUser = await userRepository.verifyEmail(
      user.id
    );

    if (!verifiedUser) {
      throw new Error("Failed to verify test user.");
    }

    userId = verifiedUser.id;

    const generatedToken = tokenService.generate();

    await sessionRepository.create({
      userId,
      tokenHash: generatedToken.tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    sessionCookie =
      `${SESSION_COOKIE_NAME}=${generatedToken.rawToken}`;
  });

  afterAll(async () => {
    await testPool.end();
  });

  const authenticatedRequest = () =>
    request(app)
      .post("/api/agent/chat")
      .set("Origin", allowedOrigin)
      .set("Cookie", sessionCookie);

  it("should execute the injected rate limiter", async () => {
    const previousCalls = injectedRateLimiterCalls;

    const response = await authenticatedRequest()
      .send({
        message: "Test injected rate limiter",
        scope: "personal",
      });

    expect(response.status).toBe(200);
    expect(injectedRateLimiterCalls).toBe(previousCalls + 1);
  });

  it("should reject requests without an Origin header", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .set("Cookie", sessionCookie)
      .send({
        message: "Hello",
        scope: "personal",
      });

    expect(response.status).toBe(403);
  });

  it("should reject requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .set("Origin", "https://malicious.example.com")
      .set("Cookie", sessionCookie)
      .send({
        message: "Hello",
        scope: "personal",
      });

    expect(response.status).toBe(403);
  });

  it("should reject anonymous requests", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .set("Origin", allowedOrigin)
      .send({
        message: "Hello",
        scope: "personal",
      });

    expect(response.status).toBe(401);
  });

  it("should reject invalid session cookies", async () => {
    const response = await request(app)
      .post("/api/agent/chat")
      .set("Origin", allowedOrigin)
      .set(
        "Cookie",
        `${SESSION_COOKIE_NAME}=invalid-session-token`
      )
      .send({
        message: "Hello",
        scope: "personal",
      });

    expect(response.status).toBe(401);
  });

  it("should reject an empty message", async () => {
    const response = await authenticatedRequest()
      .send({
        message: "",
        scope: "personal",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
  });

  it("should reject unexpected request properties", async () => {
    const response = await authenticatedRequest()
      .send({
        message: "Hello",
        scope: "personal",
        unexpectedField: "not allowed",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("should create a personal conversation for the authenticated user", async () => {
    const response = await authenticatedRequest()
      .send({
        message: "Hello AgentMacArthur",
        scope: "personal",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.agent).toBe("AgentMacArthur");
    expect(response.body.response).toContain(
      "Hello AgentMacArthur"
    );

    const conversationId = response.body.conversationId;

    expect(conversationId).toBeTruthy();

    const conversationResult = await testPool.query(
      `SELECT created_by, scope, status
       FROM conversations
       WHERE id = $1`,
      [conversationId]
    );

    expect(conversationResult.rows).toHaveLength(1);
    expect(conversationResult.rows[0]).toEqual({
      created_by: userId,
      scope: "personal",
      status: "active",
    });

    const messageResult = await testPool.query(
      `SELECT role, content
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY message_order ASC`,
      [conversationId]
    );

    expect(messageResult.rows).toEqual([
      {
        role: "user",
        content: "Hello AgentMacArthur",
      },
      {
        role: "assistant",
        content: expect.stringContaining(
          "Hello AgentMacArthur"
        ),
      },
    ]);
  });

  it("should maintain conversation history across requests", async () => {
    const firstResponse = await authenticatedRequest()
      .send({
        message: "My name is Alex.",
        scope: "personal",
      });

    expect(firstResponse.status).toBe(200);

    const conversationId = firstResponse.body.conversationId;

    const secondResponse = await authenticatedRequest()
      .send({
        message: "What is my name?",
        conversationId,
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.conversationId).toBe(
      conversationId
    );

    expect(secondResponse.body.response).toContain(
      "Total messages in conversation: 3."
    );

    const messageResult = await testPool.query(
      `SELECT role, content
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY message_order ASC`,
      [conversationId]
    );

    expect(messageResult.rows).toHaveLength(4);
    expect(messageResult.rows.map(
      (message: { role: string }) => message.role
    )).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("should reject an invalid conversation ID", async () => {
    const response = await authenticatedRequest()
      .send({
        message: "Hello",
        conversationId: "invalid-id",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "conversationId",
        }),
      ])
    );
  });
});
