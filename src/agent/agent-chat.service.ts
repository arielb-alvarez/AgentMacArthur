import type { AgentProvider } from "./agent-provider.js";
import type {
  ConversationService,
  StartConversationInput,
} from "../conversations/conversation.service.js";
import type { ConversationMessage } from "../conversations/conversation.types.js";

export type ChatCommand =
  | {
      message: string;
      conversationId: string;
    }
  | {
      message: string;
      scope: "personal";
    }
  | {
      message: string;
      scope: "organization";
      organizationId: string;
    }
  | {
      message: string;
      scope: "project";
      organizationId: string;
      projectId: string;
    };

export interface ChatResult {
  conversationId: string;
  response: string;
}

export class AgentChatService {
  constructor(
    private readonly agentProvider: AgentProvider,
    private readonly conversationService: ConversationService
  ) {}

  async chat(
    userId: string,
    command: ChatCommand
  ): Promise<ChatResult> {
    let conversationInput: StartConversationInput;

    if ("conversationId" in command) {
      conversationInput = {
        conversationId: command.conversationId,
      };
    } else if (command.scope === "personal") {
      conversationInput = {
        createdBy: userId,
        scope: "personal",
      };
    } else if (command.scope === "organization") {
      conversationInput = {
        createdBy: userId,
        scope: "organization",
        organizationId: command.organizationId,
      };
    } else {
      conversationInput = {
        createdBy: userId,
        scope: "project",
        organizationId: command.organizationId,
        projectId: command.projectId,
      };
    }

    const userMessage: ConversationMessage = {
      role: "user",
      content: command.message,
    };

    // The user message is authorized and persisted transactionally.
    const conversation = await this.conversationService.startTurn(
      userId,
      conversationInput,
      userMessage
    );

    // AI generation happens outside the database transaction.
    const messages: ConversationMessage[] =
      conversation.messages.map((item) => ({ ...item }));

    const response =
      await this.agentProvider.generateChatResponse(messages);

    // Access is rechecked before the assistant response is persisted.
    await this.conversationService.completeTurn(
      conversation.id,
      userId,
      {
        role: "assistant",
        content: response,
      }
    );

    return {
      conversationId: conversation.id,
      response,
    };
  }
}
