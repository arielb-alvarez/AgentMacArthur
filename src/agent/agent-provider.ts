export interface AgentProvider {
  generateChatResponse(message: string): Promise<string>;
}