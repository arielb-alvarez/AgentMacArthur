
import { describe, it, expect } from "vitest";
import { conversationService } from "../../src/conversations/conversation.service.js";

describe("Conversation Service", () => {
  it("should create a new conversation", () => {
    const conversation = conversationService.createConversation();

    expect(conversation.id).toBeDefined();
    expect(conversation.messages).toEqual([]);
    expect(conversation.createdAt).toBeInstanceOf(Date);
    expect(conversation.updatedAt).toBeInstanceOf(Date);
  });

  it("should retrieve an existing conversation", () => {
    const created = conversationService.createConversation();

    const conversation = conversationService.getConversation(created.id);

    expect(conversation).toBeDefined();
    expect(conversation?.id).toBe(created.id);
  });

  it("should add a message to an existing conversation", () => {
    const conversation = conversationService.createConversation();

    const message = {
      role: "user" as const,
      content: "Hello AgentMacArthur",
    };

    const updated = conversationService.addMessage(
      conversation.id,
      message
    );

    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0]).toEqual(message);
  });

  it("should return undefined for an invalid conversation ID", () => {
    const conversation = conversationService.getConversation("invalid-id");

    expect(conversation).toBeUndefined();
  });

  it("should preserve previous messages when adding new messages", () => {
    const conversation = conversationService.createConversation();

    conversationService.addMessage(conversation.id, {
        role: "user",
        content: "My name is Alex.",
    });

    conversationService.addMessage(conversation.id, {
        role: "assistant",
        content: "Nice to meet you, Alex.",
    });

    conversationService.addMessage(conversation.id, {
        role: "user",
        content: "What is my name?",
    });

    const updated = conversationService.getConversation(conversation.id);

    expect(updated?.messages).toHaveLength(3);

    expect(updated?.messages[0].content).toBe("My name is Alex.");
    expect(updated?.messages[1].content).toBe("Nice to meet you, Alex.");
    expect(updated?.messages[2].content).toBe("What is my name?");
 });
});
