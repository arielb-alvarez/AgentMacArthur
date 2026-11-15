import { pool } from "../config/database.js";
import { env } from "../config/env.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresUserRepository } from "../users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";
import { PostgresAuthTokenRepository } from "../auth-tokens/postgres-auth-token.repository.js";
import { PostgresSessionRepository } from "../sessions/postgres-session.repository.js";

import { PasswordService } from "../auth/password.service.js";
import { TokenService } from "../auth/token.service.js";
import { AuthService } from "../auth/auth.service.js";
import { UserService } from "../users/user.service.js";
import { RegistrationService } from "../auth/registration.service.js";
import { EmailVerificationService } from "../auth/email-verification.service.js";

import { DevelopmentEmailService } from "../email/development-email.service.js";
import type { EmailService } from "../email/email.service.js";

import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthenticationMiddleware } from "../middleware/auth.middleware.js";

const transactionManager = new PostgresTransactionManager(pool);

// Shared infrastructure dependencies.
const userRepository = new PostgresUserRepository(
  pool,
  transactionManager
);

const organizationRepository = new PostgresOrganizationRepository(
  pool,
  transactionManager
);

const organizationMemberRepository =
  new PostgresOrganizationMemberRepository(
    pool,
    transactionManager
  );

const authTokenRepository = new PostgresAuthTokenRepository(
  pool,
  transactionManager
);

const sessionRepository = new PostgresSessionRepository(
  pool,
  transactionManager
);

// Authentication utilities.
const passwordService = new PasswordService();
const tokenService = new TokenService();

// Application services.
const userService = new UserService(
  userRepository,
  organizationRepository,
  organizationMemberRepository,
  authTokenRepository,
  transactionManager,
  passwordService,
  tokenService
);

export const authService = new AuthService(
  userRepository,
  sessionRepository,
  passwordService,
  tokenService,
  transactionManager
);

// Production must use a real email provider.
// Never silently log verification links in production.
const createEmailService = (): EmailService => {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "A production email provider must be configured before authentication can start."
    );
  }

  return new DevelopmentEmailService();
};

const emailService = createEmailService();

const registrationService = new RegistrationService(
  userService,
  emailService
);

const emailVerificationService = new EmailVerificationService(
  userRepository,
  authTokenRepository,
  transactionManager,
  tokenService
);

// Authentication middleware.
export const authMiddleware =
  createAuthenticationMiddleware(authService);

// HTTP controller.
export const authController = createAuthController(
  registrationService,
  emailVerificationService,
  authService
);
