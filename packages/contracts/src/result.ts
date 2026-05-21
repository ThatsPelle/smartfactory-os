/**
 * Result<T, E> — explicit fallible return type.
 *
 * Used in lifecycle hooks and validation paths where errors are part of the
 * normal control flow and should be type-checked, not caught.
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } =>
  r.ok;

export const isErr = <T, E>(r: Result<T, E>): r is { readonly ok: false; readonly error: E } =>
  !r.ok;

/** Unwrap or throw — for tests and trusted internal callers only. */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
};
