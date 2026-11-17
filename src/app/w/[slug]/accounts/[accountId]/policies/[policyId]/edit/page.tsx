import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyForm } from "@/components/account/PolicyForm";
import { DeductibleScheduleSection } from "@/components/policy/DeductibleScheduleSection";
import { listPolicyDeductibles } from "@/server/deductibles/queries";
import { formatDate } from "@/lib/format";
import type { PolicyFormInput } from "@/lib/schemas/policy";
import { getAccountDetail } from "@/server/accounts/queries";
import { requireWorkspace } from "../../../../../lib";

export const metadata: Metadata = { title: "Edit policy" };

export default async function EditPolicyPage({ params }: { params: Promise<{ slug: string; accountId: string; policyId: string }> }) {
  const { slug, accountId, policyId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  if (!detail) notFound();
  const p = detail.policies.find((x) => x.id === policyId);
  if (!p) notFound();
  const deductibleRows = await listPolicyDeductibles(ws.id, p.id);

  const str = (n: number | null) => (n === null ? "" : String(n));
  const defaults: PolicyFormInput = {
    carrier: p.carrier,
    lineOfBusiness: p.lineOfBusiness,
    policyNumber: p.policyNumber ?? "",
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    occurrenceLimit: str(p.occurrenceLimit),
    aggregateLimit: str(p.aggregateLimit),
    deductible: str(p.deductible),
    annualPremium: String(p.annualPremium),
    commissionRate: String(p.commissionRate),
    exposureBasis: p.exposureBasis,
    exposureAmount: str(p.exposureAmount),
    endorsements: p.endorsements,
    renewalStatus: p.renewalStatus,
    previousPolicyId: p.previousPolicyId ?? "",
    notes: p.notes ?? "",
    insurableValue: str(p.insurableValue),
    coinsurancePercent: p.coinsurancePercent === null ? "" : String(p.coinsurancePercent),
  };
  const previousOptions = detail.policies
    .filter((other) => other.id !== p.id)
    .map((other) => ({ id: other.id, label: `${other.lineOfBusiness} · ${other.carrier} · expires ${formatDate(other.expiryDate)}` }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {p.lineOfBusiness} · {p.carrier}
        </h1>
        <p className="text-sm text-muted-foreground">{detail.account.name}. Fields marked * are required.</p>
      </div>
      <PolicyForm
        slug={slug}
        accountId={accountId}
        policyId={p.id}
        defaultValues={defaults}
        previousOptions={previousOptions}
        cancelHref={`/w/${slug}/accounts/${accountId}/policies/${p.id}`}
      />
      <div className="max-w-3xl">
        <DeductibleScheduleSection slug={slug} policyId={p.id} policyDeductible={p.deductible} headline={{ occurrenceLimit: p.occurrenceLimit, aggregateLimit: p.aggregateLimit }} rows={deductibleRows} />
      </div>
    </div>
  );
}
