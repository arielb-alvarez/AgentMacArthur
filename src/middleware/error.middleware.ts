import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app.error.js";
import { logger } from "../utils/logger.js";

export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error("Request failed", {
    method: req.method,
    path: req.path,
    errorName: error.name,
    errorMessage: error.message,
  });

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred.",
  });
};