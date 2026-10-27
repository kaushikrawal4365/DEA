/**
 * Tagged Result<T, E> algebra for fail-closed, explicit error handling.
 * Eliminates unhandled exceptions across boundaries.
 */

export type Ok<T> = {
  readonly _tag: 'Ok';
  readonly value: T;
};

export type Err<E> = {
  readonly _tag: 'Err';
  readonly error: E;
};

export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { _tag: 'Ok', value };
}

export function err<E>(error: E): Err<E> {
  return { _tag: 'Err', error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === 'Ok';
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === 'Err';
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  const errVal = result.error;
  if (errVal instanceof Error) {
    throw errVal;
  }
  throw new Error(String(errVal));
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

export function map<T, U, E>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

export function andThen<T, U, E>(result: Result<T, E>, fn: (val: T) => Result<U, E>): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}
