/**
 * Runtime guards for upstream JSON.
 *
 * Warcraft Logs responses are arbitrary JSON until proven otherwise. Nothing
 * here coerces: a field that is missing, null where it must not be, or of the
 * wrong type reads as "not usable", and the caller fails closed. A wrong value
 * is never repaired into a plausible one.
 *
 * These are ~40 lines of guards rather than a schema-validation dependency,
 * which keeps the Worker free of runtime dependencies. Revisit that trade when
 * the normalized event model arrives and the shapes multiply.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUsableString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A non-empty string, or `undefined` when absent/blank/not a string. */
export function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return isUsableString(value) ? value : undefined;
}

/** A safe integer, or `undefined` when absent/null/not an integer. */
export function readInteger(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return isSafeInteger(value) ? value : undefined;
}

/**
 * A safe integer or an explicit `null`.
 *
 * `undefined` means the field was absent or malformed — which is a different
 * thing from WCL explicitly reporting "no value", and the two must not merge.
 */
export function readNullableInteger(source: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in source)) {
    return undefined;
  }
  const value = source[key];
  if (value === null) {
    return null;
  }
  return isSafeInteger(value) ? value : undefined;
}

export function readRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = source[key];
  return isRecord(value) ? value : undefined;
}

export function readArray(source: Record<string, unknown>, key: string): readonly unknown[] | undefined {
  const value = source[key];
  return Array.isArray(value) ? value : undefined;
}

/** An array whose every element is a safe integer, or `undefined`. */
export function readIntegerArray(
  source: Record<string, unknown>,
  key: string,
): readonly number[] | undefined {
  const value = readArray(source, key);
  if (value === undefined || !value.every(isSafeInteger)) {
    return undefined;
  }
  return value;
}
