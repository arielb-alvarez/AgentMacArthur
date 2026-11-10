import type { ConversationMessage } from "../conversations/conversation.types.js";

export interface AgentProvider {
  generateChatResponse(
    messages: ConversationMessage[]
  ): Promise<string>;
}
