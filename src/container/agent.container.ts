import { createAgentController } from "../controllers/agent.controller.js";
import { getAgentProvider } from "../agent/agent-provider.factory.js";
import { AgentChatService } from "../agent/agent-chat.service.js";

import { PostgresConversationRepository } from "../conversations/postgres-conversation.repository.js";
import { ConversationService } from "../conversations/conversation.service.js";

// Infrastructure dependency.
const conversationRepository = new PostgresConversationRepository();

// Application dependency.
const conversationService = new ConversationService(
  conversationRepository
);

// Agent chat orchestration.
const agentChatService = new AgentChatService(
  getAgentProvider(),
  conversationService
);

// HTTP controller.
export const agentController = createAgentController(agentChatService);
