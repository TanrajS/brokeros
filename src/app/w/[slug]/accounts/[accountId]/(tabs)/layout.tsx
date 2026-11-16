import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { AccountTabs, type AccountTab } from "@/components/account/AccountTabs";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACCOUNT_STATUS_LABELS } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { getAccountDetail } from "@/server/accounts/queries";
import { accountTabCounts } from "@/server/accounts/tabs";
import { requireWorkspace } from "../../../lib";

/**
 * The account header and tab strip (v1.3): Overview, Loss runs, Program,
 * Documents, Strategy. Edit and policy pages sit outside this group.
 */
export default async function AccountTabsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; accountId: string }> }) {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = /^[0-9a-f-]{36}$/.test(accountId) ? await getAccountDetail(ws.id, accountId) : null;
  if (!detail) notFound();
  const { account, contacts, policies } = detail;
  const counts = await accountTabCounts(ws.id, account.id);
  const base = `/w/${slug}/accounts/${account.id}`;
  const tabs: AccountTab[] = [
    { segment: "overview", label: "Overview" },
    { segment: "loss-runs", label: "Loss runs", count: counts.claims },
    { segment: "program", label: "Program", count: counts.layers },
    { segment: "documents", label: "Documents", count: counts.documents },
    { segment: "strategy", label: "Strategy", count: counts.options },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href={`/w/${slug}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to book
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{titleCase(account.industry)}</span>
              <span aria-hidden="true">·</span>
              <span>{account.province}</span>
              <Badge variant={account.status === "active" ? "default" : "secondary"}>{ACCOUNT_STATUS_LABELS[account.status]}</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`${base}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <DeleteAccountButton slug={slug} accountId={account.id} accountName={account.name} contactCount={contacts.length} policyCount={policies.length} claimCount={counts.claims} />
          </div>
        </div>
      </div>
      <div className="print:hidden">
        <AccountTabs base={base} tabs={tabs} />
      </div>
      {children}
    </div>
  );
}
