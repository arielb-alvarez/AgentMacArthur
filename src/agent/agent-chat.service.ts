
import type { AgentProvider } from "./agent-provider.js";
import type { ConversationService } from "../conversations/conversation.service.js";
import type { ConversationMessage } from "../conversations/conversation.types.js";
import { AppError } from "../errors/app.error.js";

export interface ChatCommand {
  message: string;
  conversationId?: string;
}

export interface ChatResult {
  conversationId: string;
  response: string;
}

export class AgentChatService {
  constructor(
    private readonly agentProvider: AgentProvider,
    private readonly conversationService: ConversationService
  ) {}

  async chat(command: ChatCommand): Promise<ChatResult> {
    let conversation;

    if (command.conversationId) {
      conversation = await this.conversationService.getConversation(
        command.conversationId
      );

      if (!conversation) {
        throw new AppError("Conversation not found.", 404);
      }
    } else {
      conversation = await this.conversationService.createConversation();
    }

    const updatedConversation =
      await this.conversationService.addMessage(conversation.id, {
        role: "user",
        content: command.message,
      });

    if (!updatedConversation) {
      throw new AppError("Conversation could not be updated.", 500);
    }

    const messages: ConversationMessage[] =
      updatedConversation.messages.map((item) => ({ ...item }));

    const response = await this.agentProvider.generateChatResponse(messages);

    const completedConversation =
      await this.conversationService.addMessage(conversation.id, {
        role: "assistant",
        content: response,
      });

    if (!completedConversation) {
      throw new AppError("Conversation could not be updated.", 500);
    }

    return {
      conversationId: conversation.id,
      response,
    };
  }
}
