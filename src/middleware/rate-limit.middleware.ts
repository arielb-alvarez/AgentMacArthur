import rateLimit from "express-rate-limit";

interface RateLimitConfig {
  windowMs: number;
  apiLimit: number;
  chatLimit: number;
}

export const createRateLimiters = ({
  windowMs,
  apiLimit,
  chatLimit,
}: RateLimitConfig) => {
  const apiRateLimiter = rateLimit({
    windowMs,
    limit: apiLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      },
    },
  });

  const chatRateLimiter = rateLimit({
    windowMs,
    limit: chatLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "CHAT_RATE_LIMIT_EXCEEDED",
        message: "Too many chat requests. Please try again later.",
      },
    },
  });

  return {
    apiRateLimiter,
    chatRateLimiter,
  };
};

const productionLimiters = createRateLimiters({
  windowMs: 15 * 60 * 1000,
  apiLimit: 100,
  chatLimit: 10,
});

export const apiRateLimiter = productionLimiters.apiRateLimiter;
export const chatRateLimiter = productionLimiters.chatRateLimiter;

const authRegistrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "REGISTRATION_RATE_LIMIT_EXCEEDED",
      message:
        "Too many registration attempts. Please try again later.",
    },
  },
});

const emailVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "EMAIL_VERIFICATION_RATE_LIMIT_EXCEEDED",
      message:
        "Too many email verification attempts. Please try again later.",
    },
  },
});

const authLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "LOGIN_RATE_LIMIT_EXCEEDED",
      message: "Too many login attempts. Please try again later.",
    },
  },
});

export {
  authRegistrationRateLimiter,
  emailVerificationRateLimiter,
  authLoginRateLimiter,
};
