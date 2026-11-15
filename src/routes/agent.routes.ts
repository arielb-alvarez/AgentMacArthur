import { Router } from "express";

import { agentController } from "../container/agent.container.js";

import { validate } from "../middleware/validate.middleware.js";
import { chatRateLimiter } from "../middleware/rate-limit.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

router.post(
  "/chat",
  chatRateLimiter,
  validate(chatSchema),
  agentController.chat
);

export default router;
