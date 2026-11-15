import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";
import type { UserRepository } from "../users/user.repository.js";
import type { AuthTokenRepository } from "../auth-tokens/auth-token.repository.js";
import type { TokenService } from "./token.service.js";
import type { User } from "../users/user.types.js";

export class EmailVerificationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionManager: TransactionManager,
    private readonly tokenService: TokenService
  ) {}

  async verify(rawToken: string): Promise<User> {
    if (!rawToken) {
      throw new AppError("Invalid or expired verification token.", 400);
    }

    const tokenHash = this.tokenService.hash(rawToken);

    return this.transactionManager.runInTransaction(
      "verifyUserEmail",
      async (client) => {
        const token =
          await this.authTokenRepository.findActiveByTokenHash(
            tokenHash,
            "email_verification",
            client
          );

        if (!token) {
          throw new AppError(
            "Invalid or expired verification token.",
            400
          );
        }

        const consumedToken =
          await this.authTokenRepository.consume(token.id, client);

        if (!consumedToken) {
          throw new AppError(
            "Invalid or expired verification token.",
            400
          );
        }

        const user = await this.userRepository.verifyEmail(
          token.userId,
          client
        );

        if (!user) {
          throw new AppError(
            "This account cannot be activated.",
            409
          );
        }

        return user;
      }
    );
  }
}
