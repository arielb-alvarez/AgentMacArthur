import { Router } from "express";

import {
  authController,
  authMiddleware,
} from "../container/auth.container.js";

import { validate } from "../middleware/validate.middleware.js";

import {
  authRegistrationRateLimiter,
  emailVerificationRateLimiter,
  authLoginRateLimiter,
} from "../middleware/rate-limit.middleware.js";

import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
} from "../validators/auth.validator.js";

import {
  requireTrustedOrigin,
} from "../middleware/trusted-origin.middleware.js";

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new account
 *     description: Creates a user, personal workspace, and email verification request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Account created. Verification email sent.
 *       400:
 *         description: Request validation failed.
 *       409:
 *         description: Email address already registered.
 *       429:
 *         description: Registration rate limit exceeded.
 *       503:
 *         description: Verification email delivery failed.
 */
router.post(
  "/register",
  authRegistrationRateLimiter,
  validate(registerSchema),
  authController.register
);

/**
 * @openapi
 * /api/auth/verify-email:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify an email address
 *     description: Consumes a valid email verification token and activates the account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyEmailRequest'
 *     responses:
 *       200:
 *         description: Email successfully verified.
 *       400:
 *         description: Verification token invalid, expired, or already used.
 *       409:
 *         description: Account cannot be activated.
 *       429:
 *         description: Verification rate limit exceeded.
 */
router.post(
  "/verify-email",
  emailVerificationRateLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log in
 *     description: Authenticates a user and sets an HttpOnly session cookie.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful. Session cookie issued.
 *       400:
 *         description: Request validation failed.
 *       401:
 *         description: Invalid email or password.
 *       403:
 *         description: Account is not permitted to log in.
 *       429:
 *         description: Login rate limit exceeded.
 */
router.post(
  "/login",
  authLoginRateLimiter,
  requireTrustedOrigin,
  validate(loginSchema),
  authController.login
);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get current authenticated user
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200:
 *         description: Current user returned.
 *       401:
 *         description: Authentication required or session expired.
 */
router.get(
  "/me",
  authMiddleware.requireAuth,
  authController.me
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Log out
 *     description: Revokes the current session and clears the session cookie.
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200:
 *         description: Logout successful.
 *       403:
 *         description: Untrusted request origin.
 */
router.post(
  "/logout",
  requireTrustedOrigin,
  authMiddleware.optionalAuth,
  authController.logout
);

export default router;
