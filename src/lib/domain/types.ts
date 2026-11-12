/**
 * Shared shapes for domain calculations.
 *
 * Every exported calculation in src/lib/domain returns a Calc: the value plus the
 * "math" that produced it, so the UI can show its work and tests can assert on
 * intermediate steps. These files import no React, no database and never read
 * the real clock; dates arrive as YYYY-MM-DD strings.
 */

/** A calendar date as YYYY-MM-DD. No time, no time zone. */
export type ISODate = string;

export interface CalcMath {
  /** The named inputs exactly as received. */
  inputs: Record<string, unknown>;
  /** The formula in words. */
  formula: string;
  /** Intermediate values, in the order they were computed. */
  steps: Record<string, unknown>;
}

export interface Calc<T> {
  value: T;
  math: CalcMath;
}

/** A calculation that can refuse its input. `value` is null exactly when `error` is set. */
export type CalcResult<T> =
  | { value: T; error: null; math: CalcMath }
  | { value: null; error: string; math: CalcMath };
