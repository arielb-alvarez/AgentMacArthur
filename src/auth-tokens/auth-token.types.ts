export type AuthTokenPurpose =
  | "email_verification"
  | "password_reset";

export interface AuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreateAuthTokenInput {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}
