import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { UserRepository } from "../users/user.repository.js";
import type { User } from "../users/user.types.js";

import type { SessionRepository } from "../sessions/session.repository.js";
import type { Session } from "../sessions/session.types.js";

import type { PasswordService } from "./password.service.js";
import type { TokenService } from "./token.service.js";

const SESSION_EXPIRATION_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: User;
  sessionId: string;
  sessionToken: string;
  expiresAt: Date;
}

export interface AuthenticatedSession {
  user: User;
  session: Session;
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly transactionManager: TransactionManager
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();

    const credentials =
      await this.userRepository.findCredentialsByEmail(email);

    if (
      !credentials ||
      !(await this.passwordService.verifyPassword(
        input.password,
        credentials.passwordHash
      ))
    ) {
      throw new AppError("Invalid email or password.", 401);
    }

    if (credentials.user.status === "pending") {
      throw new AppError(
        "Please verify your email address before logging in.",
        403
      );
    }

    if (
      credentials.user.status !== "active" ||
      !credentials.user.emailVerifiedAt
    ) {
      throw new AppError(
        "This account is not available for authentication.",
        403
      );
    }

    const generatedToken = this.tokenService.generate();

    const expiresAt = new Date(
      Date.now() +
        SESSION_EXPIRATION_DAYS * MILLISECONDS_PER_DAY
    );

    return this.transactionManager.runInTransaction(
      "createUserSession",
      async (client) => {
        // Recheck account status inside the session-creation
        // transaction to avoid issuing a session for an account
        // that was suspended after the initial credential lookup.
        const currentUser = await this.userRepository.findById(
          credentials.user.id,
          client
        );

        if (
          !currentUser ||
          currentUser.status !== "active" ||
          !currentUser.emailVerifiedAt
        ) {
          throw new AppError(
            "This account is not available for authentication.",
            403
          );
        }

        const session = await this.sessionRepository.create(
          {
            userId: currentUser.id,
            tokenHash: generatedToken.tokenHash,
            expiresAt,
          },
          client
        );

        return {
          user: currentUser,
          sessionId: session.id,
          sessionToken: generatedToken.rawToken,
          expiresAt: session.expiresAt,
        };
      }
    );
  }

  async logout(sessionId: string): Promise<void> {
    await this.transactionManager.runInTransaction(
      "logoutUserSession",
      async (client) => {
        await this.sessionRepository.revoke(sessionId, client);
      }
    );
  }

  async authenticate(
    rawToken: string
  ): Promise<AuthenticatedSession> {
    if (!rawToken) {
      throw new AppError("Invalid or expired session.", 401);
    }

    const tokenHash = this.tokenService.hash(rawToken);

    const result = await this.transactionManager.runInTransaction(
      "authenticateUserSession",
      async (client) => {
        const session =
          await this.sessionRepository.findActiveByTokenHash(
            tokenHash,
            client
          );

        if (!session) {
          return undefined;
        }

        const user = await this.userRepository.findById(
          session.userId,
          client
        );

        if (
          !user ||
          user.status !== "active" ||
          !user.emailVerifiedAt
        ) {
          // Revoke sessions belonging to accounts that are
          // no longer eligible to authenticate.
          await this.sessionRepository.revoke(
            session.id,
            client
          );

          return { invalid: true as const };
        }

        const updatedSession =
          await this.sessionRepository.updateLastUsed(
            session.id,
            client
          );

        if (!updatedSession) {
          return undefined;
        }

        return {
          invalid: false as const,
          user,
          session: updatedSession,
        };
      }
    );

    if (!result || result.invalid) {
      throw new AppError("Invalid or expired session.", 401);
    }

    return {
      user: result.user,
      session: result.session,
    };
  }
}
