export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true
  ) {
    super(message);

    if (
      !Number.isInteger(statusCode) ||
      statusCode < 400 ||
      statusCode > 599
    ) {
      throw new RangeError("AppError statusCode must be between 400 and 599.");
    }

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}