export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}