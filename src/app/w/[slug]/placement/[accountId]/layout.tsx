import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { PlacementTabs } from "@/components/placement/PlacementTabs";
import { getDb } from "@/server/db/client";
import { accounts } from "@/server/db/schema";
import { requireWorkspace } from "../../lib";

export default async function PlacementAccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; accountId: string }> }) {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const account = /^[0-9a-f-]{36}$/.test(accountId)
    ? await getDb().query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) })
    : undefined;
  if (!account) notFound();
  const base = `/w/${slug}/placement/${account.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 print:hidden">
        <Link href={`/w/${slug}/placement`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All accounts
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
          <Link href={`/w/${slug}/accounts/${account.id}`} className="text-sm underline-offset-4 hover:underline">
            Open account
          </Link>
        </div>
      </div>
      <div className="print:hidden">
        <PlacementTabs base={base} />
      </div>
      {children}
    </div>
  );
}
