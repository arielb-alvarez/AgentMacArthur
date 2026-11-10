import type { Request, Response, NextFunction } from "express";
import { getAgentProvider } from "../agent/agent-provider.factory.js";

export const chat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid message is required.",
      });
    }

    const agentProvider = getAgentProvider();

    const response = await agentProvider.generateChatResponse(message);

    return res.status(200).json({
      success: true,
      agent: "AgentMacArthur",
      response,
    });
  } catch (error) {
    next(error);
  }
};