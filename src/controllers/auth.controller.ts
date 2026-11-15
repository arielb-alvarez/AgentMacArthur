import type { Request, Response, NextFunction } from "express";

import type { RegistrationService } from "../auth/registration.service.js";
import type { EmailVerificationService } from "../auth/email-verification.service.js";
import type { AuthService } from "../auth/auth.service.js";

import { AppError } from "../errors/app.error.js";

import {
  setSessionCookie,
  clearSessionCookie,
} from "../auth/session-cookie.js";

export const createAuthController = (
  registrationService: RegistrationService,
  emailVerificationService: EmailVerificationService,
  authService: AuthService
) => {
  const register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await registrationService.register(req.body);

      return res.status(201).json({
        success: true,
        message:
          "Registration successful. Please check your email to verify your account.",
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  };

  const verifyEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = await emailVerificationService.verify(
        req.body.token
      );

      return res.status(200).json({
        success: true,
        message: "Email address successfully verified.",
        user,
      });
    } catch (error) {
      next(error);
    }
  };

  const login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await authService.login(req.body);

      setSessionCookie(
        res,
        result.sessionToken,
        result.expiresAt
      );

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  };

  const me = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.auth) {
      next(new AppError("Authentication required.", 401));
      return;
    }

    return res.status(200).json({
      success: true,
      user: req.auth.user,
    });
  };

  const logout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Never accept a session ID from the request body.
      // Only revoke the session authenticated by our middleware.
      if (req.auth) {
        await authService.logout(req.auth.session.id);
      }

      clearSessionCookie(res);

      return res.status(200).json({
        success: true,
        message: "Logout successful.",
      });
    } catch (error) {
      next(error);
    }
  };

  return {
    register,
    verifyEmail,
    login,
    me,
    logout,
  };
};
