export type UserStatus =
  | "pending"
  | "active"
  | "suspended";

export interface User {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface UserCredentials {
  user: User;
  passwordHash: string;
}
