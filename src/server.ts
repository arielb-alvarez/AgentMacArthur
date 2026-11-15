import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  logDatabasePoolMetrics,
  pool,
  startDatabasePoolMonitoring,
} from "./config/database.js";
import { logger } from "./utils/logger.js";
import { startServer } from "./server-startup.js";

void startServer({
  app,
  port: env.PORT,
  connectDatabase,
  closeDatabase: () => pool.end(),
  logDatabasePoolMetrics,
  startDatabasePoolMonitoring,
  logger,
  registerSignalHandler: (signal, handler) => {
    process.once(signal, handler);
  },
  setExitCode: (code) => {
    process.exitCode = code;
  },
  forceExit: (code) => {
    process.exit(code);
  },
});
