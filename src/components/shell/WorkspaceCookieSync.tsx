"use client";

import { useEffect } from "react";
import { adoptWorkspace } from "@/server/workspace/actions";

/**
 * When someone opens a shared link, the server cannot set a cookie while
 * rendering, so this tiny client component asks a server action to remember
 * the workspace. It renders nothing.
 */
export function WorkspaceCookieSync({ slug }: { slug: string }) {
  useEffect(() => {
    void adoptWorkspace(slug);
  }, [slug]);
  return null;
}
