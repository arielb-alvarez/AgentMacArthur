import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const REQUEST_ID_HEADER = "x-request-id";

const isValidRequestId = (value: string): boolean => {
  return /^[a-zA-Z0-9._-]{1,128}$/.test(value);
};

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incomingRequestId = req.get(REQUEST_ID_HEADER);

  const requestId =
    incomingRequestId && isValidRequestId(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  next();
};
