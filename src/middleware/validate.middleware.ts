import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "params" | "query";

export const validate = (
  schema: ZodType,
  part: RequestPart = "body"
): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });

      return;
    }

    if (part === "body") {
      req.body = result.data;
    } else {
      res.locals.validatedRequest = {
        ...res.locals.validatedRequest,
        [part]: result.data,
      };
    }

    next();
  };
};
