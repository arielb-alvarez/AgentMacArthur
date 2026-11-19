import type { AuthenticatedSession } from "../auth/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export {};
