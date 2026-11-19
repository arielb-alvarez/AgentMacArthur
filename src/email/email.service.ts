export interface VerificationEmail {
  to: string;
  displayName: string;
  verificationUrl: string;
  expiresAt: Date;
}

export interface InvitationEmail {
  to: string;
  organizationName: string;
  inviterDisplayName: string;
  roleName: string;
  invitationUrl: string;
  expiresAt: Date;
}

export interface EmailService {
  sendVerificationEmail(
    email: VerificationEmail
  ): Promise<void>;

  sendInvitationEmail(
    email: InvitationEmail
  ): Promise<void>;
}