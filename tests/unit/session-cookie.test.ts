import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";

import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  setSessionCookie,
  clearSessionCookie,
} from "../../src/auth/session-cookie.js";

describe("Session Cookie", () => {
  it("should use secure cookie settings", () => {
    const options = getSessionCookieOptions();

    expect(options).toEqual({
      httpOnly: true,
      secure: options.secure,
      sameSite: "lax",
      path: "/",
    });
  });

  it("should set the session cookie with its expiration", () => {
    const res = {
      cookie: vi.fn(),
    } as unknown as Response;

    const expiresAt = new Date("2026-11-16T12:00:00.000Z");

    setSessionCookie(res, "test-session-token", expiresAt);

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "test-session-token",
      {
        ...getSessionCookieOptions(),
        expires: expiresAt,
      }
    );
  });

  it("should clear the session cookie using matching options", () => {
    const res = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    clearSessionCookie(res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      getSessionCookieOptions()
    );
  });
});
