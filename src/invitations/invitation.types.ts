export type InvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";

export type InvitationEmailDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "unknown";

// Initially supported organization invitation roles.
// Custom roles can be introduced later.
export type OrganizationInvitationRole =
  | "admin"
  | "member";

export interface Invitation {
  id: string;
  organizationId: string;
  projectId: string | null;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  invitedBy: string;
  acceptedBy: string | null;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  emailDeliveryStatus: InvitationEmailDeliveryStatus;
  emailDeliveryAttempts: number;
  emailLastAttemptAt: Date | null;
  emailSentAt: Date | null;
  emailDeliveryAttemptId: string | null;
  emailDeliveryStartedAt: Date | null;
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  roleKey: OrganizationInvitationRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  emailDeliveryAttemptId: string;
  emailDeliveryStartedAt: Date;
}

export interface ReplaceInvitationTokenInput {
  organizationId: string;
  invitationId: string;
  tokenHash: string;
  expiresAt: Date;
  emailDeliveryAttemptId: string;
  emailDeliveryStartedAt: Date;
  staleAttemptBefore: Date;
}

export interface RecordInvitationDeliveryInput {
  invitationId: string;
  emailDeliveryAttemptId: string;
  status: "sent" | "failed" | "unknown";
  sentAt: Date | null;
}
