import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Decimal } from "@prisma/client/runtime/library";

function serializeDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Decimal) return value.toNumber();

  if (typeof value === "bigint") return Number(value);

  // Prisma Decimal serialized as { s, e, d } object
  if (
    typeof value === "object" &&
    value !== null &&
    "s" in value &&
    "e" in value &&
    "d" in value &&
    Array.isArray((value as Record<string, unknown>).d)
  ) {
    try {
      return new Decimal(value as Decimal).toNumber();
    } catch {
      return value;
    }
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(serializeDecimals);

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeDecimals(v);
    }
    return result;
  }

  return value;
}

@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serializeDecimals(data)));
  }
}
