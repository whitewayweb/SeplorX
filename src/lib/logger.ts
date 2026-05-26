/**
 * Structured logging for SeplorX.
 *
 * Pino gives us production-grade JSON logs, redaction, and low overhead.
 * This adapter keeps the existing logger.info("message", metadata) style.
 */
import pino, { type Logger as PinoLogger } from "pino";

const SENSITIVE_KEYS = [
  "email",
  "buyerEmail",
  "customer_email",
  "name",
  "buyerName",
  "contactPerson",
  "phone",
  "shipping_phone",
  "address",
  "shipping_address",
  "notes",
  "return_notes",
  "password",
  "currentPassword",
  "newPassword",
  "apiKey",
  "apiPassword",
  "apiToken",
  "accessToken",
  "refreshToken",
  "clientId",
  "clientSecret",
  "consumerKey",
  "consumerSecret",
  "webhookSecret",
  "credentials",
  "auth",
  "authorization",
  "token",
  "secret",
] as const;

type LogFields = Record<string, unknown>;
type LogLevel = "info" | "warn" | "error";

export type AppLogger = {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  child: (bindings: LogFields) => AppLogger;
  measure: <T>(message: string, fields: LogFields, operation: () => Promise<T>) => Promise<T>;
};

const redactPaths = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
  `*.*.*.${key}`,
  `headers.${key}`,
  `req.headers.${key}`,
  `request.headers.${key}`,
]);

function readTime() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function scrubString(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]")
    .replace(
      /\b(password|pass|pwd|token|access_token|refresh_token|api[_-]?key|secret|client[_-]?secret|authorization)=([^&\s]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /\b(password|pass|pwd|token|access_token|refresh_token|api[_-]?key|secret|client[_-]?secret|authorization):\s*([^\s,}]+)/gi,
      "$1: [REDACTED]",
    );
}

function isRecord(value: unknown): value is LogFields {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Error);
}

function redact(data: unknown, seen = new WeakSet<object>()): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") return scrubString(data);
  if (data instanceof Error) {
    return {
      type: data.constructor.name,
      message: scrubString(data.message),
      stack: data.stack ? scrubString(data.stack) : undefined,
    };
  }

  if (typeof data === "object") {
    if (seen.has(data)) return "[CIRCULAR]";
    seen.add(data);

    if (Array.isArray(data)) {
      return data.map((item) => redact(item, seen));
    }

    const redacted: LogFields = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey.toLowerCase()))) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redact(value, seen);
      }
    }
    return redacted;
  }

  return data;
}

function toLogFields(args: unknown[]): LogFields {
  const fields: LogFields = {};
  const values: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      if (!fields.err) fields.err = redact(arg);
      else values.push(redact(arg));
    } else if (isRecord(arg)) {
      Object.assign(fields, redact(arg));
    } else {
      values.push(redact(arg));
    }
  }

  if (values.length > 0) fields.values = values;
  return fields;
}

function mergeFields(...fields: Array<LogFields | undefined>) {
  return Object.assign({}, ...fields.filter(Boolean));
}

function writeLog(pinoLogger: PinoLogger, bindings: LogFields, level: LogLevel, message: string, args: unknown[]) {
  const fields = mergeFields(bindings, toLogFields(args));
  const safeMessage = scrubString(message);

  if (Object.keys(fields).length === 0) {
    pinoLogger[level](safeMessage);
    return;
  }

  pinoLogger[level](fields, safeMessage);
}

export function createAppLogger(pinoLogger: PinoLogger, bindings: LogFields = {}): AppLogger {
  return {
    info: (message, ...args) => writeLog(pinoLogger, bindings, "info", message, args),
    warn: (message, ...args) => writeLog(pinoLogger, bindings, "warn", message, args),
    error: (message, ...args) => writeLog(pinoLogger, bindings, "error", message, args),
    child: (childBindings) => createAppLogger(pinoLogger, mergeFields(bindings, redact(childBindings) as LogFields)),
    measure: async (message, fields, operation) => {
      const startedAt = readTime();
      const logFields = mergeFields(bindings, fields);

      try {
        const result = await operation();
        writeLog(pinoLogger, logFields, "info", `${message} completed`, [
          { durationMs: Math.round(readTime() - startedAt) },
        ]);
        return result;
      } catch (error) {
        writeLog(pinoLogger, logFields, "error", `${message} failed`, [
          { durationMs: Math.round(readTime() - startedAt), error },
        ]);
        throw error;
      }
    },
  };
}

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: "seplorx",
    environment: process.env.NODE_ENV ?? "development",
  },
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export const logger = createAppLogger(pinoLogger);
