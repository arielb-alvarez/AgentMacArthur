import type { Request, Response, NextFunction } from "express";
// import { generateChatResponse } from "../services/agent.service.js";
import { generateChatResponse } from "../services/mock-agent.service.js";

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

    const response = await generateChatResponse(message);

    return res.status(200).json({
      success: true,
      agent: "AgentMacArthur",
      response,
    });
  } catch (error) {
    next(error);
  }
};