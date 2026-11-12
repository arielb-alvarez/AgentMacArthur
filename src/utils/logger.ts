type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: unknown;
}

const sensitiveKeyPattern =
  /password|token|secret|authorization|cookie|api[_-]?key/i;

const sanitize = (
  value: unknown,
  seen = new WeakSet<object>()
): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    try {
      if (Array.isArray(value)) {
        return value.map((item) => sanitize(item, seen));
      }

      const sanitized: Record<string, unknown> = {};

      for (const [key, item] of Object.entries(value)) {
        sanitized[key] = sensitiveKeyPattern.test(key)
          ? "[REDACTED]"
          : sanitize(item, seen);
      }

      return sanitized;
    } finally {
      seen.delete(value);
    }
  }

  return value;
};

const log = (entry: LogEntry): void => {
  const sanitizedEntry = sanitize(entry) as LogEntry;

  if (process.env.NODE_ENV === "production") {
    const output = JSON.stringify(sanitizedEntry);

    if (entry.level === "error") {
      console.error(output);
    } else if (entry.level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }

    return;
  }

  const level = entry.level.toUpperCase();

  const context = entry.context !== undefined
    ? ` ${JSON.stringify(sanitizedEntry.context)}`
    : "";

  const output =
    `${entry.timestamp} [${level}] ${entry.message}${context}`;

  if (entry.level === "error") {
    console.error(output);
  } else if (entry.level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
};

export const logger = {
  info: (message: string, context?: unknown): void => {
    log({
      level: "info",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  },

  warn: (message: string, context?: unknown): void => {
    log({
      level: "warn",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  },

  error: (message: string, context?: unknown): void => {
    log({
      level: "error",
      message,
      timestamp: new Date().toISOString(),
      context,
    });
  },
};
