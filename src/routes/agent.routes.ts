import { Router } from "express";

import { createAgentController } from "../controllers/agent.controller.js";
import { getAgentProvider } from "../agent/agent-provider.factory.js";

import { PostgresConversationRepository } from "../conversations/postgres-conversation.repository.js";
import { ConversationService } from "../conversations/conversation.service.js";

import { validate } from "../middleware/validate.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

const conversationRepository = new PostgresConversationRepository();

const conversationService = new ConversationService(
  conversationRepository
);

const agentController = createAgentController(
  getAgentProvider(),
  conversationService
);

router.post("/chat", validate(chatSchema), agentController.chat);

export default router;