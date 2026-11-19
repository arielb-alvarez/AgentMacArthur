import { pool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresConversationRepository } from "../conversations/postgres-conversation.repository.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { ConversationAccessService } from "../conversations/conversation-access.service.js";

import { PostgresOrganizationPermissionRepository } from "../permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../permissions/organization-permission.service.js";

import { getAgentProvider } from "../agent/agent-provider.factory.js";
import { AgentChatService } from "../agent/agent-chat.service.js";

import { createAgentController } from "../controllers/agent.controller.js";

// Shared transaction manager for conversation operations and
// permission checks. All checks inside a turn use the same client.
const transactionManager = new PostgresTransactionManager(pool);

// Infrastructure dependencies.
const conversationRepository =
  new PostgresConversationRepository();

const organizationPermissionRepository =
  new PostgresOrganizationPermissionRepository(
    pool,
    transactionManager
  );

// Application services.
const organizationPermissionService =
  new OrganizationPermissionService(
    organizationPermissionRepository
  );

const conversationAccessService =
  new ConversationAccessService(
    organizationPermissionService
  );

const conversationService = new ConversationService(
  conversationRepository,
  transactionManager,
  conversationAccessService
);

// Agent orchestration.
const agentChatService = new AgentChatService(
  getAgentProvider(),
  conversationService
);

// HTTP controller.
export const agentController =
  createAgentController(agentChatService);
