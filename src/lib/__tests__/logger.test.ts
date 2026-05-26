import { Writable } from "node:stream";
import pino from "pino";
import { createAppLogger } from "@/lib/logger";

function createCapturedLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const pinoLogger = pino({ base: null, timestamp: false }, stream);
  return {
    logger: createAppLogger(pinoLogger),
    lines,
  };
}

describe("logger", () => {
  it("redacts sensitive metadata before writing logs", () => {
    const { logger, lines } = createCapturedLogger();

    logger.info("credential check", {
      channelId: 12,
      credentials: { accessToken: "token-123" },
      nested: {
        customerEmail: "buyer@example.com",
        safe: "visible",
      },
    });

    const output = lines.join("");
    expect(output).not.toContain("token-123");
    expect(output).not.toContain("buyer@example.com");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("visible");
  });

  it("scrubs secrets from strings and error messages", () => {
    const { logger, lines } = createCapturedLogger();

    logger.error(
      "provider failed token=abc123",
      new Error("Request failed with Authorization: Bearer secret-token and api_key=secret-key"),
    );

    const output = lines.join("");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("secret-key");
    expect(output).toContain("token=[REDACTED]");
    expect(output).toContain("api_key=[REDACTED]");
  });

  it("measures operations without call sites tracking startedAt", async () => {
    const { logger, lines } = createCapturedLogger();

    await logger.measure("test operation", { component: "logger-test" }, async () => "ok");

    const entry = JSON.parse(lines.join(""));
    expect(entry.msg).toBe("test operation completed");
    expect(entry.component).toBe("logger-test");
    expect(typeof entry.durationMs).toBe("number");
  });
});
