import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { CertificatesSection } from "@/components/program/CertificatesSection";
import { RequirementsSection } from "@/components/program/RequirementsSection";
import { TowerSection } from "@/components/program/TowerSection";
import { LINE_GROUPS, LINE_GROUP_LABELS, LINE_GROUP_PRIMARY, certificateStatus, checkRequirements, type LineGroup } from "@/lib/domain/program";
import { formatDate } from "@/lib/format";
import { loadProgramInputs, toCertificateInput, toProgramPolicy, toRequirementInput, toTowerInput } from "@/server/program/queries";
import { requireWorkspace } from "../../../lib";

export const metadata: Metadata = { title: "Program" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

function href(slug: string, accountId: string, group: LineGroup, umbrella: boolean): string {
  const params = new URLSearchParams();
  if (group !== "gl") params.set("group", group);
  if (umbrella) params.set("umbrella", "1");
  const qs = params.toString();
  return `/w/${slug}/placement/${accountId}/program${qs ? `?${qs}` : ""}`;
}

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const data = await loadProgramInputs(ws, accountId);
  if (!data) notFound();

  const group: LineGroup = (LINE_GROUPS as readonly string[]).includes(first(sp.group)) ? (first(sp.group) as LineGroup) : "gl";
  const countUmbrella = first(sp.umbrella) === "1";
  const groupLayers = data.layers.filter((l) => l.lineGroup === group);
  const label = (p: { lineOfBusiness: string; carrier: string; expiryDate: string }) => `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}`;
  const participantsLabel = (policyId: string | null) => {
    const rows = policyId ? (data.participantsByPolicy.get(policyId) ?? []) : [];
    return rows.length ? rows.map((r) => `${r.carrier} ${r.signedLine}%`).join(" · ") : null;
  };

  const programPolicies = data.policies.map((p) => toProgramPolicy(p, data.renewedOn.get(p.id) ?? null));
  // Current terms only: a policy that has a successor is superseded.
  const superseded = new Set(data.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const currentPolicies = programPolicies.filter((p) => !superseded.has(p.id) && p.expiryDate > ws.asOfDate);
  const checker = checkRequirements(data.requirements.map(toRequirementInput), currentPolicies, groupLayers.map(toTowerInput), { countUmbrella });
  const certRows = data.certificates.map((c) => {
    const r = certificateStatus(toCertificateInput(c), programPolicies, ws.asOfDate).value;
    return { id: c.id, holder: c.holder, operationsDescription: c.operationsDescription, coverages: c.coverages, requiredBy: c.requiredBy, issuedOn: c.issuedOn, notes: c.notes, status: r.status, reasons: r.reasons };
  });

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Line group" className="flex flex-wrap gap-1.5">
        {LINE_GROUPS.map((g) => (
          <Link
            key={g}
            href={href(slug, accountId, g, countUmbrella)}
            aria-current={g === group ? "page" : undefined}
            className={cn("inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", g === group ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {LINE_GROUP_LABELS[g]}
          </Link>
        ))}
      </nav>

      <TowerSection
        slug={slug}
        accountId={accountId}
        lineGroup={group}
        layers={groupLayers.map((l) => ({ ...toTowerInput(l), policyId: l.policyId, participants: participantsLabel(l.policyId) }))}
        policyOptions={data.policies
          .filter((p) => !superseded.has(p.id) && (p.lineOfBusiness === LINE_GROUP_PRIMARY[group] || p.lineOfBusiness === "Umbrella/Excess"))
          .map((p) => ({ id: p.id, label: label(p) }))}
      />

      <RequirementsSection
        slug={slug}
        accountId={accountId}
        results={checker.value}
        countUmbrella={countUmbrella}
        toggleHref={href(slug, accountId, group, !countUmbrella)}
        mathLines={[`Using the ${LINE_GROUP_LABELS[group]} tower for umbrella and excess limits.`, ...(checker.math.steps.lines as string[])]}
        notesById={Object.fromEntries(data.requirements.map((r) => [r.id, r.notes]))}
      />

      <CertificatesSection slug={slug} accountId={accountId} asOf={ws.asOfDate} rows={certRows} />
    </div>
  );
}
