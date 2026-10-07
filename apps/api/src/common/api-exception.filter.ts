import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "@sala/contracts";
import type { Request, Response } from "express";
import { ApiException } from "./api-error.js";

const INTERNAL_MESSAGE = "Error interno.";

/** Maps a framework `HttpException` status onto the closest ApiError code (other 4xx are request-shape problems). */
function codeForStatus(status: number): ApiErrorCode {
  if (status >= 500) return "INTERNAL_ERROR";
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    default:
      return "VALIDATION_ERROR";
  }
}

/** Normalizes every thrown error into the `{ error: { code, message } }` ApiError shape. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();

    if (exception instanceof ApiException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = codeForStatus(status);
      if (status >= 500) {
        this.logUnhandled(http.getRequest<Request>(), exception);
        res.status(status).json({ error: { code, message: INTERNAL_MESSAGE } });
        return;
      }
      const body = exception.getResponse();
      const message = typeof body === "string" ? body : ((body as { message?: string })?.message ?? exception.message);
      res.status(status).json({ error: { code, message: Array.isArray(message) ? message.join(", ") : message } });
      return;
    }

    this.logUnhandled(http.getRequest<Request>(), exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: "INTERNAL_ERROR", message: INTERNAL_MESSAGE } });
  }

  private logUnhandled(req: Request | undefined, exception: unknown): void {
    // Path only (no query string, which could carry tokens); ids are not masked here since the
    // stack is what identifies the failure.
    console.error(
      JSON.stringify({
        evt: "unhandled_error",
        method: req?.method,
        path: req?.path,
        msg: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
    );
  }
}
