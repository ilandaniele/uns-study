type Level = "log" | "warn" | "error" | "debug" | "verbose";

function render(msg: unknown): unknown {
  if (msg instanceof Error) return msg.message;
  return msg;
}

/**
 * Console logger for the Worker (`new Logger(Context.name)`, `.log/.warn/.error/.debug/.verbose`).
 * Emits one JSON line per call: `{ lvl, ctx, msg, ...}`. Extra arguments land in `rest` (an Error
 * contributes its stack as `stack`).
 */
// Context lives outside the instance so the class has no private members: structurally it is
// then interchangeable with any other `{ log, warn, error, debug, verbose }` logger.
const contexts = new WeakMap<object, string | undefined>();

export class Logger {
  constructor(context?: string) {
    contexts.set(this, context);
  }

  log(msg: unknown, ...rest: unknown[]): void {
    emit(this, "log", msg, rest);
  }

  warn(msg: unknown, ...rest: unknown[]): void {
    emit(this, "warn", msg, rest);
  }

  error(msg: unknown, ...rest: unknown[]): void {
    emit(this, "error", msg, rest);
  }

  debug(msg: unknown, ...rest: unknown[]): void {
    emit(this, "debug", msg, rest);
  }

  verbose(msg: unknown, ...rest: unknown[]): void {
    emit(this, "verbose", msg, rest);
  }
}

function emit(self: Logger, lvl: Level, msg: unknown, rest: unknown[]): void {
  const line: Record<string, unknown> = { lvl, ctx: contexts.get(self), msg: render(msg) };
  if (msg instanceof Error && msg.stack) line.stack = msg.stack;
  let extra = rest;
  // Convention: `logger.error(message, stack)`.
  if (lvl === "error" && typeof extra[0] === "string") {
    line.stack = extra[0];
    extra = extra.slice(1);
  }
  if (extra.length > 0) line.rest = extra.map(render);
  const text = safeStringify(line);
  if (lvl === "error") console.error(text);
  else if (lvl === "warn") console.warn(text);
  else console.log(text);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ lvl: "error", msg: "unserializable log entry" });
  }
}
