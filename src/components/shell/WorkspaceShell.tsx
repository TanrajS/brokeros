import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { readWorkspaceCookie } from "@/server/workspace/cookie";
import { DatabaseUnavailableError, getWorkspaceBySlug } from "@/server/workspace/queries";
import { formatDate } from "@/lib/format";
import { ShareLinkButton } from "./ShareLinkButton";
import { WorkspaceCookieSync } from "./WorkspaceCookieSync";
import { WorkspaceNav } from "./WorkspaceNav";

/** Header + navigation around every workspace page. Async so it can live inside Suspense. */
export async function WorkspaceShell({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params;

  let workspace;
  try {
    workspace = await getWorkspaceBySlug(slug);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) redirect("/setup?reason=unreachable");
    throw err;
  }
  if (!workspace) notFound();

  const remembered = await readWorkspaceCookie();
  const needsAdopt = remembered !== workspace.id;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {needsAdopt ? <WorkspaceCookieSync slug={slug} /> : null}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link href={`/w/${slug}`} className="min-w-0 truncate font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm">
            {workspace.name}
          </Link>
          <Link
            href={`/w/${slug}/settings#as-of`}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            title="Every date calculation uses this as-of date. Change it in Settings."
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <span>
              As of <span className="font-medium text-foreground">{formatDate(workspace.asOfDate)}</span>
            </span>
          </Link>
          <ShareLinkButton slug={slug} />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <WorkspaceNav slug={slug} />
        <main id="main" className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
