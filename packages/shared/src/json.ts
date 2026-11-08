import type { z } from "zod";

/** Parses a JSON string against a schema; malformed JSON and invalid shapes both give null. */
export function parseJson<T extends z.ZodType>(schema: T, raw: string | null | undefined): z.infer<T> | null {
  if (raw == null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
