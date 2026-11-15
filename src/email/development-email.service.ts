import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

import type {
  EmailService,
  VerificationEmail,
} from "./email.service.js";

export class DevelopmentEmailService implements EmailService {
  constructor(
    nodeEnv: typeof env.NODE_ENV = env.NODE_ENV
  ) {
    if (nodeEnv === "production") {
      throw new Error(
        "DevelopmentEmailService cannot be used in production."
      );
    }
  }

  async sendVerificationEmail(
    email: VerificationEmail
  ): Promise<void> {
    logger.info("Development verification email generated", {
      to: email.to,
      displayName: email.displayName,
      verificationUrl: email.verificationUrl,
      expiresAt: email.expiresAt,
    });
  }
}