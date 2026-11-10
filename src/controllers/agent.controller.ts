import type { Request, Response, NextFunction } from "express";

import type { AgentProvider } from "../agent/agent-provider.js";

import type { ConversationService } from "../conversations/conversation.service.js";

export const createAgentController = (
  agentProvider: AgentProvider,
  conversationService: ConversationService
) => {
  const chat = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { message, conversationId } = req.body;

      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: "A valid message is required.",
        });
      }

      let conversation;

      if (conversationId) {
        conversation = await conversationService.getConversation(
          conversationId
        );

        if (!conversation) {
          return res.status(404).json({
            success: false,
            message: "Conversation not found.",
          });
        }
      } else {
        conversation = await conversationService.createConversation();
      }

      await conversationService.addMessage(conversation.id, {
        role: "user",
        content: message,
      });

      const updatedConversation =
        await conversationService.getConversation(conversation.id);

      if (!updatedConversation) {
        throw new Error("Conversation could not be retrieved.");
      }

      const response = await agentProvider.generateChatResponse(
        updatedConversation.messages.map((item) => ({ ...item }))
      );

      await conversationService.addMessage(conversation.id, {
        role: "assistant",
        content: response,
      });

      return res.status(200).json({
        success: true,
        agent: "AgentMacArthur",
        conversationId: conversation.id,
        response,
      });
    } catch (error) {
      next(error);
    }
  };

  return { chat };
};