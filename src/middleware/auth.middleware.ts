import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

import { AppError } from "../errors/app.error.js";
import type { AuthService } from "../auth/auth.service.js";
import { SESSION_COOKIE_NAME } from "../auth/session-cookie.js";

const getSessionToken = (req: Request): string | undefined => {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  const matchingCookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) =>
      cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
    );

  // Reject ambiguous duplicate session cookies.
  if (matchingCookies.length !== 1) {
    return undefined;
  }

  const rawValue = matchingCookies[0].slice(
    SESSION_COOKIE_NAME.length + 1
  );

  if (!rawValue) {
    return undefined;
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return undefined;
  }
};

export const createAuthenticationMiddleware = (
  authService: AuthService
) => {
  const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const token = getSessionToken(req);

    if (!token) {
      next(new AppError("Authentication required.", 401));
      return;
    }

    try {
      req.auth = await authService.authenticate(token);
      next();
    } catch (error) {
      next(error);
    }
  };

  const optionalAuthenticate: RequestHandler = (
    req,
    _res,
    next
  ) => {
    const token = getSessionToken(req);

    if (!token) {
      next();
      return;
    }

    void authService.authenticate(token)
      .then((authenticatedSession) => {
        req.auth = authenticatedSession;
        next();
      })
      .catch((error: unknown) => {
        // An invalid or expired session is treated as anonymous.
        if (
          error instanceof AppError &&
          error.statusCode === 401
        ) {
          next();
          return;
        }

        next(error);
      });
  };

  return {
    requireAuth: authenticate,
    optionalAuth: optionalAuthenticate,
  };
};
