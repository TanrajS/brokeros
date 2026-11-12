import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyForm } from "@/components/account/PolicyForm";
import { addDays } from "@/lib/domain/dates";
import { formatDate } from "@/lib/format";
import { emptyPolicyForm } from "@/lib/schemas/policy";
import { getAccountDetail } from "@/server/accounts/queries";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "New policy" };

export default async function NewPolicyPage({ params }: { params: Promise<{ slug: string; accountId: string }> }) {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  if (!detail) notFound();

  // Default to a 12-month term starting on the as-of date.
  const defaults = emptyPolicyForm(ws.asOfDate, addDays(ws.asOfDate, 365).value);
  const previousOptions = detail.policies.map((p) => ({ id: p.id, label: `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}` }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New policy for {detail.account.name}</h1>
        <p className="text-sm text-muted-foreground">Fields marked * are required.</p>
      </div>
      <PolicyForm slug={slug} accountId={accountId} defaultValues={defaults} previousOptions={previousOptions} cancelHref={`/w/${slug}/accounts/${accountId}`} />
    </div>
  );
}
