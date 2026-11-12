import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(
      process.hrtime.bigint() - startTime
    ) / 1_000_000;

    const context = {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    };

    if (res.statusCode >= 500) {
      logger.error("HTTP request completed", context);
    } else if (res.statusCode >= 400) {
      logger.warn("HTTP request completed", context);
    } else {
      logger.info("HTTP request completed", context);
    }
  });

  next();
};
