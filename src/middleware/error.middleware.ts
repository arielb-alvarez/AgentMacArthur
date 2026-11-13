import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app.error.js";
import { logger } from "../utils/logger.js";

interface RequestParsingError extends Error {
  status?: number;
  type?: string;
}

export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error("Request failed", {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    errorName: error.name,
  });

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  const requestError = error as RequestParsingError;

  if (requestError.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the maximum allowed size of 1 MB.",
      },
    });
  }

  if (requestError.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON.",
      },
    });
  }

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred.",
  });
};
