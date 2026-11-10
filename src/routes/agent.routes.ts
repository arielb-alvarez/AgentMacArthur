import { Router } from "express";
import { createAgentController } from "../controllers/agent.controller.js";
import { getAgentProvider } from "../agent/agent-provider.factory.js";
import { validate } from "../middleware/validate.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

const agentController = createAgentController(getAgentProvider());
router.post("/chat", validate(chatSchema), agentController.chat);

export default router;