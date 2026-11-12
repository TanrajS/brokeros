import "server-only";
import { cookies } from "next/headers";

export const WORKSPACE_COOKIE = "brokeros_workspace";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Reads the workspace id stored on the visitor's browser, if any. */
export async function readWorkspaceCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(WORKSPACE_COOKIE)?.value ?? null;
}

/** Remembers the workspace for this browser. Only callable from a server action or route handler. */
export async function writeWorkspaceCookie(workspaceId: string): Promise<void> {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}
