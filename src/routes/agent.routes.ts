import { Router } from "express";

import { createAgentController } from "../controllers/agent.controller.js";
import { getAgentProvider } from "../agent/agent-provider.factory.js";
import { AgentChatService } from "../agent/agent-chat.service.js";

import { PostgresConversationRepository } from "../conversations/postgres-conversation.repository.js";
import { ConversationService } from "../conversations/conversation.service.js";

import { validate } from "../middleware/validate.middleware.js";
import { chatRateLimiter } from "../middleware/rate-limit.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

// Infrastructure dependency.
const conversationRepository = new PostgresConversationRepository();

// Application dependency.
const conversationService = new ConversationService(
  conversationRepository
);

// Chat orchestration.
const agentChatService = new AgentChatService(
  getAgentProvider(),
  conversationService
);

// HTTP controller.
const agentController = createAgentController(agentChatService);

router.post(
  "/chat",
  chatRateLimiter,
  validate(chatSchema),
  agentController.chat
);

export default router;
