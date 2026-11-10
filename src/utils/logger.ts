type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: unknown;
}

const log = (entry: LogEntry): void => {
  console.log(JSON.stringify(entry));
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