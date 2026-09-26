import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiErrors } from "./api-error.js";

/** Validates a controller body/query against a zod schema, throwing the shared `VALIDATION_ERROR` shape. */
export class ZodBodyPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw ApiErrors.validation(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    return result.data;
  }
}
