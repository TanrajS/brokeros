import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { AdvancedProgramSection } from "@/components/program/AdvancedProgramSection";
import { TowerSection } from "@/components/program/TowerSection";
import { LINE_GROUPS, LINE_GROUP_LABELS, LINE_GROUP_PRIMARY, isAdvancedProgram, towerInputsFrom, type LineGroup } from "@/lib/domain/program";
import { formatDate } from "@/lib/format";
import { layersFor, loadProgramInputs } from "@/server/program/queries";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Program" };

type SearchParams = Record<string, string | string[] | undefined>;
type View = "simple" | "advanced";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

function href(slug: string, accountId: string, group: LineGroup, view: View | ""): string {
  const params = new URLSearchParams();
  if (group !== "gl") params.set("group", group);
  if (view) params.set("view", view);
  const qs = params.toString();
  return `/w/${slug}/accounts/${accountId}/program${qs ? `?${qs}` : ""}`;
}

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const data = await loadProgramInputs(ws, accountId);
  if (!data) notFound();

  const group: LineGroup = (LINE_GROUPS as readonly string[]).includes(first(sp.group)) ? (first(sp.group) as LineGroup) : "gl";
  const groupLayers = layersFor(data, group);
  const advanced = isAdvancedProgram(groupLayers);
  const requestedView = first(sp.view);
  // Advanced switches on by itself when any layer has several insurers or there is more than one tower.
  const view: View = requestedView === "advanced" || requestedView === "simple" ? (advanced && requestedView === "simple" ? "advanced" : requestedView) : advanced ? "advanced" : "simple";
  const towerInputs = towerInputsFrom(groupLayers);
  const label = (p: { lineOfBusiness: string; carrier: string; expiryDate: string }) => `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}`;
  const participantsLabel = (policyId: string | null | undefined) => {
    const rows = policyId ? (data.participantsByPolicy.get(policyId) ?? []) : [];
    return rows.length ? rows.map((r) => `${r.carrier} ${r.signedLine}%`).join(" · ") : null;
  };

  const superseded = new Set(data.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const policyOptions = data.policies
    .filter((p) => !superseded.has(p.id) && (p.lineOfBusiness === LINE_GROUP_PRIMARY[group] || p.lineOfBusiness === "Umbrella/Excess"))
    .map((p) => ({ id: p.id, label: label(p) }));
  // TIV: the insurable value of the linked property policy, else the largest current property value.
  const linked = groupLayers.map((l) => l.policyId).filter((x): x is string => !!x);
  const tiv =
    data.policies.find((p) => linked.includes(p.id) && p.insurableValue !== null)?.insurableValue ??
    data.policies.filter((p) => !superseded.has(p.id) && p.lineOfBusiness === LINE_GROUP_PRIMARY[group] && p.insurableValue !== null).sort((a, b) => (b.insurableValue ?? 0) - (a.insurableValue ?? 0))[0]?.insurableValue ??
    null;
  const pill = (active: boolean) => cn("inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Line group" className="flex flex-wrap gap-1.5">
          {LINE_GROUPS.map((g) => (
            <Link key={g} href={href(slug, accountId, g, "")} aria-current={g === group ? "page" : undefined} className={pill(g === group)}>
              {LINE_GROUP_LABELS[g]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Program view" className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">View:</span>
          <Link href={href(slug, accountId, group, "simple")} aria-current={view === "simple" ? "page" : undefined} aria-disabled={advanced || undefined} className={cn(pill(view === "simple"), advanced && "pointer-events-none opacity-50")} title={advanced ? "This program has several insurers or towers, so the simple view does not apply" : undefined}>
            Simple
          </Link>
          <Link href={href(slug, accountId, group, "advanced")} aria-current={view === "advanced" ? "page" : undefined} className={pill(view === "advanced")}>
            Advanced
          </Link>
        </nav>
      </div>

      {view === "advanced" ? (
        <AdvancedProgramSection slug={slug} accountId={accountId} lineGroup={group} layers={groupLayers} tiv={tiv} policyOptions={policyOptions} exportHref={`/w/${slug}/accounts/${accountId}/program/export?group=${group}`} />
      ) : (
        <TowerSection
          slug={slug}
          accountId={accountId}
          lineGroup={group}
          layers={towerInputs.map((t, i) => ({ ...t, policyId: groupLayers[i].policyId ?? null, participants: participantsLabel(groupLayers[i].policyId) }))}
          policyOptions={policyOptions}
        />
      )}

      <p className="text-xs text-muted-foreground">Every layer is read on a per-occurrence basis: attachments, limits and the coverage profile all describe one loss.</p>
    </div>
  );
}
