export const generateChatResponse = async (
  message: string
): Promise<string> => {
  return `[MOCK RESPONSE] Hello! AgentMacArthur received your message: "${message}". This is a simulated response because the application is currently running in mock mode.`;
};