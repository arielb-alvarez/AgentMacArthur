import type { Request, Response, NextFunction } from "express";

import type { AgentChatService } from "../agent/agent-chat.service.js";
import { AppError } from "../errors/app.error.js";

export const createAgentController = (
  agentChatService: AgentChatService
) => {
  const chat = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.auth) {
        throw new AppError("Authentication required.", 401);
      }

      const result = await agentChatService.chat(
        req.auth.user.id,
        req.body
      );

      return res.status(200).json({
        success: true,
        agent: "AgentMacArthur",
        conversationId: result.conversationId,
        response: result.response,
      });
    } catch (error) {
      next(error);
    }
  };

  return { chat };
};
