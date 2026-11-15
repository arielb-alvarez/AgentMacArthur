import { env } from "../config/env.js";
import { AppError } from "../errors/app.error.js";
import { logger } from "../utils/logger.js";
import type { EmailService } from "../email/email.service.js";
import type { RegisterUserInput } from "../users/user.service.js";
import { UserService } from "../users/user.service.js";

export interface RegistrationResult {
  user: Awaited<ReturnType<UserService["register"]>>["user"];
}

export class RegistrationService {
  constructor(
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly frontendUrl: string = env.FRONTEND_URL
  ) {}

  async register(
    input: RegisterUserInput
  ): Promise<RegistrationResult> {
    // Create the user, personal workspace, membership and token.
    // UserService handles the database transaction.
    const result = await this.userService.register(input);

    // Build the verification URL.
    // The fragment is not sent to the frontend web server in HTTP requests.
    const verificationUrl = new URL(
      "/verify-email",
      this.frontendUrl
    );

    verificationUrl.hash = new URLSearchParams({
      token: result.verificationToken,
    }).toString();

    try {
      await this.emailService.sendVerificationEmail({
        to: result.user.email,
        displayName: result.user.displayName,
        verificationUrl: verificationUrl.toString(),
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      // Avoid logging the raw token or verification URL.
      logger.error("Registration verification email delivery failed", {
        errorName:
          error instanceof Error ? error.name : "UnknownError",
      });

      throw new AppError(
        "Your account was created, but the verification email could not be sent. Please request a new verification email.",
        503
      );
    }

    // Never return the raw verification token to the API caller.
    return {
      user: result.user,
    };
  }
}
