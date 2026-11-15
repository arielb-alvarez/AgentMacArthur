import type { RequestHandler } from "express";

import { env } from "../config/env.js";
import { AppError } from "../errors/app.error.js";

const allowedOrigins = new Set(env.CORS_ORIGINS);

export const requireTrustedOrigin: RequestHandler = (
  req,
  _res,
  next
) => {
  const origin = req.get("Origin");

  if (!origin || !allowedOrigins.has(origin)) {
    next(
      new AppError(
        "Request origin is not allowed.",
        403
      )
    );
    return;
  }

  next();
};
