import { ZodError } from "zod";

/** Field-level errors keyed by the form field name. */
export type FieldErrors = Record<string, string>;

/**
 * Every server action returns one of these. Client code switches on `ok`
 * and never has to catch exceptions from an action.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(message: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}

export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Plain-English message for an unexpected failure; the real error is logged server-side. */
export function describeFailure(context: string, err: unknown): string {
  console.error(`[brokeros] ${context} failed:`, err);
  if (err instanceof Error && /DATABASE_URL/.test(err.message)) {
    return "The database is not configured. Set DATABASE_URL and restart the server.";
  }
  if (err instanceof Error && /(fetch failed|ECONN|ENOTFOUND|timeout|password authentication)/i.test(err.message)) {
    return "Could not reach the database. Check DATABASE_URL and that your Neon project is awake.";
  }
  return `Sorry, ${context} did not go through. Your entries are still in the form; please try again.`;
}
