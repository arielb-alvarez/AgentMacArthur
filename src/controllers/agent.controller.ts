import type { Request, Response, NextFunction } from "express";
import type { AgentChatService } from "../agent/agent-chat.service.js";

export const createAgentController = (
  agentChatService: AgentChatService
) => {
  const chat = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await agentChatService.chat(req.body);

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
