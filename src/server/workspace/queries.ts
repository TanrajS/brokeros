import "server-only";
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { accounts, workspaces, type Workspace } from "@/server/db/schema";
import { generateWorkspaceSlug } from "./slug";

/** Signals that the database could not be queried; entry points redirect to /setup. */
export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Database unavailable", { cause });
    this.name = "DatabaseUnavailableError";
  }
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new DatabaseUnavailableError(err);
  }
}

/** Deduplicated per request so the layout and page share one query. */
export const getWorkspaceBySlug = cache(async (slug: string): Promise<Workspace | null> => {
  return guard(async () => {
    const db = getDb();
    const row = await db.query.workspaces.findFirst({ where: eq(workspaces.slug, slug) });
    return row ?? null;
  });
});

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  return guard(async () => {
    const db = getDb();
    const row = await db.query.workspaces.findFirst({ where: eq(workspaces.id, id) });
    return row ?? null;
  });
}

/**
 * Creates a workspace. The as-of date defaults to the day the workspace is
 * created, which is the only moment the app consults the real clock.
 */
export async function createWorkspace(input: { name: string; asOfDate: string }): Promise<Workspace> {
  return guard(async () => {
    const db = getDb();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [row] = await db
          .insert(workspaces)
          .values({ slug: generateWorkspaceSlug(), name: input.name, asOfDate: input.asOfDate })
          .returning();
        return row;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
    throw new Error("unreachable");
  });
}

export async function countAccounts(workspaceId: string): Promise<number> {
  return guard(async () => {
    const db = getDb();
    const [row] = await db.select({ n: count() }).from(accounts).where(eq(accounts.workspaceId, workspaceId));
    return row?.n ?? 0;
  });
}

/** Checks the connection for the setup page. Never throws. */
export async function checkDatabase(): Promise<{ ok: true } | { ok: false; reason: "missing" | "unreachable"; detail?: string }> {
  if (!process.env.DATABASE_URL?.trim()) return { ok: false, reason: "missing" };
  try {
    const db = getDb();
    await db.select({ n: count() }).from(workspaces);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "unreachable", detail };
  }
}

/** Today's calendar date in UTC as YYYY-MM-DD. Used only when a workspace is created. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
