import OpenAI from "openai";
import type { AgentProvider } from "../agent/agent-provider.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/app.error.js";
import { logger } from "../utils/logger.js";
import { ConversationMessage } from "../conversations/conversation.types.js";

const getClient = (): OpenAI => {
  if (!env.OPENAI_API_KEY) {
    throw new AppError("OPENAI_API_KEY is not configured.", 500);
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
};

export const openAIAgentProvider: AgentProvider = {
  generateChatResponse: async (
    messages: ConversationMessage[]
  ): Promise<string> => {
    const client = getClient();

    try {
        const response = await client.responses.create({
            model: env.OPENAI_MODEL,
            instructions:
            "You are AgentMacArthur, an AI software engineering assistant. You help developers understand, build, debug, and improve software.",
            input: messages,
        });

        return response.output_text;
    } catch (error) {
        logger.error("OpenAI request failed", {
            provider: "openai",
            error: "insufficient_quota",
        });

        throw new AppError(
            "Our AI service is temporarily unavailable. Please try again later.",
            503
        );
    }
  },
};