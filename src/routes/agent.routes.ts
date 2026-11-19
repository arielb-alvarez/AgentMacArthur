import { Router, type RequestHandler } from "express";

import { agentController } from "../container/agent.container.js";
import { authMiddleware } from "../container/auth.container.js";

import { validate } from "../middleware/validate.middleware.js";
import { chatRateLimiter } from "../middleware/rate-limit.middleware.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";

import { chatSchema } from "../validators/agent.validator.js";

interface AgentController {
  chat: RequestHandler;
}

interface AgentAuthenticationMiddleware {
  requireAuth: RequestHandler;
}

export const createAgentRouter = (
  controller: AgentController,
  authentication: AgentAuthenticationMiddleware,
  rateLimiter: RequestHandler = chatRateLimiter
) => {
  const router = Router();

  router.post(
    "/chat",
    requireTrustedOrigin,
    rateLimiter,
    authentication.requireAuth,
    validate(chatSchema),
    controller.chat
  );

  return router;
};

/**
 * @openapi
 * /api/agent/chat:
 *   post:
 *     tags:
 *       - Agent
 *     summary: Send a message to AgentMacArthur
 *     description: Creates a scoped conversation or continues an existing conversation. Authentication is required.
 *     security:
 *       - SessionCookie: []
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
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Untrusted origin or insufficient conversation permissions.
 *       404:
 *         description: Conversation was not found.
 *       429:
 *         description: API or chat rate limit exceeded.
 *       500:
 *         description: Unexpected server or application error.
 */
const router = createAgentRouter(agentController, authMiddleware);

export default router;
