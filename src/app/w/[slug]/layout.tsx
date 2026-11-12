import { Suspense } from "react";
import { WorkspaceShell } from "@/components/shell/WorkspaceShell";

export default function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <WorkspaceShell params={params}>{children}</WorkspaceShell>
    </Suspense>
  );
}

function ShellFallback() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-4 py-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </header>
      <main id="main" className="px-4 py-6 text-sm text-muted-foreground" role="status">
        Loading workspace…
      </main>
    </div>
  );
}
