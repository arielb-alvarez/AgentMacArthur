export interface VerificationEmail {
  to: string;
  displayName: string;
  verificationUrl: string;
  expiresAt: Date;
}

export interface EmailService {
  sendVerificationEmail(
    email: VerificationEmail
  ): Promise<void>;
}