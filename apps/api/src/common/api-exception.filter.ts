import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { ApiException } from "./api-error.js";

/** Normalizes every thrown error into the `{ error: { code, message } }` ApiError shape. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === "string" ? body : ((body as { message?: string })?.message ?? exception.message);
      res.status(status).json({ error: { code: "VALIDATION_ERROR", message: Array.isArray(message) ? message.join(", ") : message } });
      return;
    }

    console.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: "VALIDATION_ERROR", message: "Error interno." } });
  }
}
