
import OpenAI from "openai";
import { env } from "../config/env.js";

// Initialize the OpenAI client
const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// Generate an AI response
export const generateChatResponse = async (
  message: string
): Promise<string> => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    instructions: "You are AgentMacArthur, an AI software engineering assistant. You help developers understand, build, debug, and improve software.",
    input: message,
  });

  return response.output_text;
};
