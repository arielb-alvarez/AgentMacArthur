export type ConversationScope =
  | "legacy"
  | "personal"
  | "organization"
  | "project";

export type ConversationStatus = "active" | "archived";

export type ConversationAction = "view" | "participate" | "manage";

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  createdBy: string | null;
  scope: ConversationScope;
  organizationId: string | null;
  projectId: string | null;
  title: string | null;
  status: ConversationStatus;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export type CreateConversationInput =
  | {
      createdBy: string;
      scope: "personal";
    }
  | {
      createdBy: string;
      scope: "organization";
      organizationId: string;
    }
  | {
      createdBy: string;
      scope: "project";
      organizationId: string;
      projectId: string;
    };
