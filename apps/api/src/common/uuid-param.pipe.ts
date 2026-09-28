import { PipeTransform } from "@nestjs/common";
import { z } from "zod";
import { ApiErrors } from "./api-error.js";

const uuidSchema = z.string().uuid();

/** Validates a route param as a UUID, throwing the shared `VALIDATION_ERROR` shape instead of
 *  falling through to Postgres with a malformed id (which would otherwise surface as a 500). */
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown): string {
    const result = uuidSchema.safeParse(value);
    if (!result.success) {
      throw ApiErrors.validation("Identificador inválido.");
    }
    return result.data;
  }
}
