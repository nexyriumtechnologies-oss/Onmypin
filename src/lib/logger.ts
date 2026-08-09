/**
 * Basic structured logger.
 * Replace with pino/console transports later — call sites stay unchanged.
 */
type Level = "info" | "warn" | "error" | "debug";

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
};
