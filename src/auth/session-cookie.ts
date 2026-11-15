import type { Response } from "express";

import { env } from "../config/env.js";

export const SESSION_COOKIE_NAME = "agentmacarthur_session";

export const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export const setSessionCookie = (
  res: Response,
  token: string,
  expiresAt: Date
): void => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(),
    expires: expiresAt,
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getSessionCookieOptions()
  );
};
