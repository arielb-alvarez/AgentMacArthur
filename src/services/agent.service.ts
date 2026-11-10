import OpenAI from "openai";
import { env } from "../config/env.js";

const getClient = (): OpenAI => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
};

export const generateChatResponse = async (
  message: string
): Promise<string> => {
  const client = getClient();

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    instructions:
      "You are AgentMacArthur, an AI software engineering assistant. You help developers understand, build, debug, and improve software.",
    input: message,
  });

  return response.output_text;
};