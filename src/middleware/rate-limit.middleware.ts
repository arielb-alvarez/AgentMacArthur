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

// Production configuration.
const productionLimiters = createRateLimiters({
  windowMs: 15 * 60 * 1000,
  apiLimit: 100,
  chatLimit: 10,
});

export const apiRateLimiter = productionLimiters.apiRateLimiter;
export const chatRateLimiter = productionLimiters.chatRateLimiter;