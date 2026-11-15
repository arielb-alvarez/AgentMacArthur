import { Router } from "express";

import { agentController } from "../container/agent.container.js";

import { validate } from "../middleware/validate.middleware.js";
import { chatRateLimiter } from "../middleware/rate-limit.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

/**
 * @openapi
 * /api/agent/chat:
 *   post:
 *     tags:
 *       - Agent
 *     summary: Send a message to AgentMacArthur
 *     description: Creates a new conversation or continues an existing conversation.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRequest'
 *     responses:
 *       200:
 *         description: Agent successfully generated a response.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatResponse'
 *       400:
 *         description: Request validation failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Conversation was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: API or chat rate limit exceeded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RateLimitError'
 *       500:
 *         description: Unexpected server or application error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/chat",
  chatRateLimiter,
  validate(chatSchema),
  agentController.chat
);

export default router;
