import { randomUUID } from "node:crypto";

import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";
import type { PasswordService } from "../auth/password.service.js";
import type { TokenService } from "../auth/token.service.js";
import type { UserRepository } from "./user.repository.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { AuthTokenRepository } from "../auth-tokens/auth-token.repository.js";
import type { User } from "./user.types.js";

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterUserResult {
  user: User;
  verificationToken: string;
  expiresAt: Date;
}

const VERIFICATION_TOKEN_EXPIRATION_HOURS = 24;

const isDuplicateEmailError = (error: unknown): boolean => {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("constraint" in error)
  ) {
    return false;
  }

  return (
    error.code === "23505" &&
    error.constraint === "idx_users_email_unique"
  );
};

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionManager: TransactionManager,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService
  ) {}

  async register(
    input: RegisterUserInput
  ): Promise<RegisterUserResult> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();

    // Hash the password before opening the database transaction.
    const passwordHash = await this.passwordService.hashPassword(
      input.password
    );

    const generatedToken = this.tokenService.generate();

    const expiresAt = new Date(
      Date.now() +
        VERIFICATION_TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000
    );

    try {
      return await this.transactionManager.runInTransaction(
        "registerUser",
        async (client) => {
          const user = await this.userRepository.create(
            {
              email,
              passwordHash,
              displayName,
            },
            client
          );

          const organization =
            await this.organizationRepository.create(
              {
                name: `${displayName}'s Workspace`,
                slug: `personal-${randomUUID()}`,
                type: "personal",
                ownerUserId: user.id,
              },
              client
            );

          await this.organizationMemberRepository.create(
            {
              organizationId: organization.id,
              userId: user.id,
              role: "owner",
              status: "active",
            },
            client
          );

          await this.authTokenRepository.create(
            {
              userId: user.id,
              purpose: "email_verification",
              tokenHash: generatedToken.tokenHash,
              expiresAt,
            },
            client
          );

          return {
            user,
            // Internal use only. Never expose this through an HTTP response.
            verificationToken: generatedToken.rawToken,
            expiresAt,
          };
        }
      );
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        throw new AppError(
          "An account with this email address already exists.",
          409
        );
      }

      throw error;
    }
  }
}
