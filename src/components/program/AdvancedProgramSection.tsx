"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { NativeSelect } from "@/components/form/NativeSelect";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import {
  COVERAGE_STATUS_LABELS,
  LAYER_TYPES,
  LAYER_TYPE_LABELS,
  analyzeTower,
  coverageProfile,
  layerSummary,
  programTotals,
  towerInputsFrom,
  towerLabels,
  type CoverageStatus,
  type LineGroup,
  type ParticipationInput,
  type ProgramLayerInput,
} from "@/lib/domain/program";
import { formatCompactDollars, parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency } from "@/lib/format";
import { layerFormSchema, participationFormSchema, type LayerFormInput, type LayerFormValues, type ParticipationFormInput, type ParticipationFormValues } from "@/lib/schemas/program";
import { deleteParticipation, deleteTowerLayer, saveLayer, saveParticipation } from "@/server/program/actions";
import { ImportPlacementDialog } from "./ImportPlacementDialog";

export interface LayerPolicyOption {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  lineGroup: LineGroup;
  layers: ProgramLayerInput[];
  /** Total insured value, when a linked property policy carries one. */
  tiv: number | null;
  policyOptions: LayerPolicyOption[];
  exportHref: string;
}

type Draft = { insurer: string; written: string; signed: string; premium: string };
type Dialogs = { kind: "layer"; layer: ProgramLayerInput | null } | { kind: "participation"; layer: ProgramLayerInput } | { kind: "delete-layer"; layer: ProgramLayerInput } | { kind: "delete-participation"; layer: ProgramLayerInput; p: ParticipationInput } | null;

// Dataviz palette: fully placed aqua; anything below or above 100% red-orange.
const STATUS_COLOR: Record<CoverageStatus, string> = { fully_placed: "#1baf7a", under_placed: "#d6473c", over_placed: "#d6473c", not_covered: "#d6473c" };
const INSURER_COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#7c6fd6", "#eb6834", "#52514e"];
const pct = (ratio: number, d = 2) => `${(ratio * 100).toFixed(d)}%`;
const pctPts = (n: number) => `${(+n.toFixed(3)).toString()}%`;
const str = (n: number | null) => (n === null ? "" : String(n));

/** Applies the inline drafts to the layers so every figure recomputes as the user types. */
function withDrafts(layers: ProgramLayerInput[], drafts: Record<string, Draft>): ProgramLayerInput[] {
  return layers.map((l) => ({
    ...l,
    participations: l.participations.map((p) => {
      const d = drafts[p.id];
      if (!d) return p;
      const written = d.written.trim() === "" ? null : Number(d.written);
      const signed = Number(d.signed);
      const premium = parseCurrencyInput(d.premium).value;
      return {
        ...p,
        insurer: d.insurer.trim() || p.insurer,
        writtenLinePct: written !== null && Number.isFinite(written) ? written : p.writtenLinePct,
        signedLinePct: Number.isFinite(signed) && d.signed.trim() !== "" ? signed : p.signedLinePct,
        premium: premium ?? p.premium,
      };
    }),
  }));
}

/**
 * The subscription view: towers side by side on one dollar scale with a
 * coverage strip, then the participation table (editable inline) with layer and
 * program totals. Every figure recomputes from the drafts before anything is saved.
 */
export function AdvancedProgramSection({ slug, accountId, lineGroup, layers, tiv, policyOptions, exportHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const live = useMemo(() => withDrafts(layers, drafts), [layers, drafts]);
  const totals = useMemo(() => programTotals(live, tiv), [live, tiv]);
  const profile = useMemo(() => coverageProfile(live, tiv), [live, tiv]);
  const towers = towerLabels(live);
  const summaries = totals.value.layers;
  const top = profile.value.programTop;
  const insurerColor = useMemo(() => {
    const names = [...new Set(live.flatMap((l) => l.participations.map((p) => p.insurer)))];
    return new Map(names.map((n, i) => [n, INSURER_COLORS[i % INSURER_COLORS.length]]));
  }, [live]);
  const towerFindings = towers.map((t) => ({ tower: t, findings: analyzeTower(towerInputsFrom(live.filter((l) => l.towerLabel === t))).value.findings }));

  function startEdit(p: ParticipationInput) {
    setDrafts((d) => ({ ...d, [p.id]: { insurer: p.insurer, written: str(p.writtenLinePct), signed: String(p.signedLinePct), premium: String(p.premium) } }));
  }
  function cancelEdit(id: string) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }
  function update(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }
  function saveRow(layer: ProgramLayerInput, p: ParticipationInput) {
    const d = drafts[p.id];
    if (!d) return;
    startTransition(async () => {
      const res = await saveParticipation(slug, layer.id, p.id, { insurer: d.insurer, writtenLinePct: d.written, signedLinePct: d.signed, premium: d.premium, policyNumber: p.policyNumber ?? "", isLead: p.isLead, notes: "" });
      if (!res.ok) {
        toast.error(res.message, { description: Object.values(res.fieldErrors ?? {}).join("; ") || undefined });
        return;
      }
      toast.success(`${d.insurer} saved`);
      cancelEdit(p.id);
      router.refresh();
    });
  }
  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(success);
      setDialog(null);
      router.refresh();
    });
  }

  const head = "px-2 py-1.5 text-left font-medium align-bottom whitespace-nowrap";
  const cell = "px-2 py-1.5 align-top tabular-nums";

  return (
    <section aria-labelledby="advanced-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="advanced-heading" className="text-lg font-semibold">
          Subscription placement
        </h2>
        <div className="flex flex-wrap gap-2">
          <ImportPlacementDialog slug={slug} accountId={accountId} lineGroup={lineGroup} />
          <Button asChild size="sm" variant="outline">
            <a href={exportHref} download>
              <Download aria-hidden="true" />
              Export schedule (CSV)
            </a>
          </Button>
          <Button type="button" size="sm" onClick={() => setDialog({ kind: "layer", layer: null })}>
            <Plus aria-hidden="true" />
            Add layer
          </Button>
        </div>
      </div>

      {layers.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No layers yet. Add a layer per tower, then each insurer&apos;s signed line on it, or import a placement schedule.</p>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Program premium ($ per year)" value={formatCurrency(totals.value.totalPremium)} />
            <Tile label="Placed limit ($)" value={formatCurrency(totals.value.totalPlacedLimit)} />
            <Tile label="Rate per $100 of TIV" value={totals.value.ratePer100Tiv === null ? null : `$${totals.value.ratePer100Tiv.toFixed(4)}`} missing="Rate per $100 (no TIV on the linked policy)" detail={tiv !== null ? `TIV ${formatCurrency(tiv)}` : "Enter an insurable value on the property policy"} />
            <Tile label="Coverage" value={profile.value.fullyPlaced ? "100% at every point" : `${formatCurrency(profile.value.totalUnplacedDollars)} unplaced`} detail={`${profile.value.segments.length} segment${profile.value.segments.length === 1 ? "" : "s"} to ${formatCurrency(top)}`} />
          </div>
          {towerFindings.some((t) => t.findings.length) ? (
            <ul className="flex flex-col gap-1.5">
              {towerFindings.flatMap((t) =>
                t.findings.map((f) => (
                  <li key={`${t.tower}-${f.kind}-${f.layerId}`} className={cn("flex items-start gap-2 rounded-lg border p-2 text-sm", f.kind === "gap" || f.kind === "no_primary" ? "border-red-600/40 bg-red-50" : "border-amber-500/60 bg-amber-50")}>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      {t.tower}: {f.message}
                    </span>
                  </li>
                )),
              )}
            </ul>
          ) : null}

          {/* Diagram */}
          <figure className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex gap-3 overflow-x-auto" role="img" aria-label={`${towers.length} tower${towers.length === 1 ? "" : "s"} drawn to ${formatCurrency(top)}; coverage ${profile.value.fullyPlaced ? "fully placed" : "not fully placed"}`}>
              <div className="relative h-80 w-16 shrink-0 text-right text-[10px] text-muted-foreground" aria-hidden="true">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <span key={f} className={cn("absolute right-1 whitespace-nowrap", f === 1 ? "top-0" : f === 0 ? "bottom-0" : "-translate-y-1/2")} style={f === 1 || f === 0 ? undefined : { bottom: `${f * 100}%` }}>
                    {formatCompactDollars(Math.round(top * f)).value}
                  </span>
                ))}
              </div>
              {towers.map((t) => (
                <div key={t} className="flex min-w-44 flex-1 flex-col gap-1">
                  <div className="relative h-80 rounded border bg-muted/30">
                    {summaries
                      .filter((s) => s.layer.towerLabel === t)
                      .map((s) => {
                        const bottom = (s.layer.attachment / top) * 100;
                        const height = Math.max(2, ((s.exhaustion - s.layer.attachment) / top) * 100);
                        return (
                          <div key={s.layer.id} className="absolute inset-x-1 flex overflow-hidden rounded border border-primary/40 text-[10px] leading-tight" style={{ bottom: `${bottom}%`, height: `${Math.min(height, 100 - bottom)}%` }} title={`${s.label}: ${pct(s.placedShare, 1)} placed, ${formatCurrency(s.layerPremium)}`}>
                            {s.participations.map((p) => (
                              <div key={p.id} className="flex items-center justify-center overflow-hidden px-0.5 text-white" style={{ width: `${p.signedLinePct}%`, background: insurerColor.get(p.insurer) }}>
                                <span className="truncate">
                                  {p.insurer.replace(" (fictional)", "")} {pctPts(p.signedLinePct)}
                                </span>
                              </div>
                            ))}
                            {s.placedShare < 1 ? (
                              <div className="flex flex-1 items-center justify-center bg-[repeating-linear-gradient(45deg,#fde68a_0_6px,#fff7d6_6px_12px)] text-amber-900">
                                <span className="truncate">unplaced {pctPts(s.underPlacedPct)}</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-center text-xs font-medium">{t}</p>
                </div>
              ))}
            </div>
            <figcaption className="text-xs text-muted-foreground">
              Each block is a layer, split by insurer share; hatched = unplaced. The segment table below adds every tower&apos;s share per segment; a placed % in red is below or above 100%.
            </figcaption>
          </figure>

          {/* Coverage table */}
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Coverage profile by segment</caption>
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className={head}>Segment ($)</th>
                  <th className={head}>Layers covering it</th>
                  <th className={`${head} text-right`}>Placed (%)</th>
                  <th className={head}>Status</th>
                  <th className={`${head} text-right`}>Unplaced ($)</th>
                  <th className={`${head} text-right`}>Blended rate on line (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profile.value.segments.map((seg, i) => (
                  <tr key={`${seg.from}-${seg.to}`}>
                    <td className={`${cell} whitespace-nowrap`}>
                      {formatCurrency(seg.from)} to {formatCurrency(seg.to)}
                    </td>
                    <td className={`${cell} text-xs`}>{seg.contributions.map((c) => `${c.towerLabel} ${c.label} ${pct(c.share, 0)}`).join(" + ") || "none"}</td>
                    <td className={cn(cell, "text-right font-medium", seg.status !== "fully_placed" && "text-red-800")}>{pct(seg.placedShare)}</td>
                    <td className={cell}>
                      <Badge variant="outline" style={{ borderColor: STATUS_COLOR[seg.status], color: seg.status === "fully_placed" ? "#0b6b4a" : "#9b1c1c" }}>
                        {COVERAGE_STATUS_LABELS[seg.status]}
                        {seg.status === "under_placed" ? ` (short ${pct(seg.shortfallShare, 1)})` : seg.status === "over_placed" ? ` (+${pct(seg.excessShare, 1)})` : ""}
                      </Badge>
                    </td>
                    <td className={`${cell} text-right`}>{seg.unplacedDollars > 0 ? formatCurrency(seg.unplacedDollars) : "—"}</td>
                    <td className={`${cell} text-right`}>{totals.value.segments[i]?.blendedRateOnLine == null ? "—" : pct(totals.value.segments[i].blendedRateOnLine!, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Participation table */}
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[56rem] text-sm">
              <caption className="sr-only">Participations by tower and layer; edit a row inline</caption>
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className={head}>Tower</th>
                  <th className={head}>Layer</th>
                  <th className={head}>Insurer</th>
                  <th className={`${head} text-right`}>Written (%)</th>
                  <th className={`${head} text-right`}>Signed (%)</th>
                  <th className={`${head} text-right`}>Premium ($ per year)</th>
                  <th className={`${head} text-right`}>Exposed limit ($)</th>
                  <th className={`${head} text-right`}>Rate on line (%)</th>
                  <th className={`${head} text-right`}>Share of layer premium (%)</th>
                  <th className={head}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaries.map((s) => (
                  <LayerRows key={s.layer.id} s={s} drafts={drafts} pending={pending} cell={cell} onEdit={startEdit} onCancel={cancelEdit} onChange={update} onSave={(p) => saveRow(s.layer, p)} onDeleteParticipation={(p) => setDialog({ kind: "delete-participation", layer: s.layer, p })} onAddParticipation={() => setDialog({ kind: "participation", layer: s.layer })} onEditLayer={() => setDialog({ kind: "layer", layer: s.layer })} onDeleteLayer={() => setDialog({ kind: "delete-layer", layer: s.layer })} />
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/20 font-semibold">
                <tr>
                  <td className={cell} colSpan={5}>
                    Program total
                  </td>
                  <td className={`${cell} text-right`}>{formatCurrency(totals.value.totalPremium)}</td>
                  <td className={`${cell} text-right`}>{formatCurrency(totals.value.totalPlacedLimit)}</td>
                  <td className={`${cell} text-right`}>{totals.value.totalPlacedLimit > 0 ? pct(totals.value.totalPremium / totals.value.totalPlacedLimit, 4) : "—"}</td>
                  <td className={cell} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Placed share = Σ signed lines. Layer premium = Σ participation premiums. Placed limit = limit × placed share. Rate on line = premium ÷ placed limit (per insurer: ÷ limit × signed line).
            Edits recompute every figure before you save; the server re-validates.
          </p>
          <ShowMath lines={[...(totals.math.steps.lines as string[]), ...(profile.math.steps.lines as string[]), ...summaries.flatMap((s) => layerSummary(s.layer).math.steps.lines as string[])]} />
        </>
      )}

      {dialog?.kind === "layer" ? <LayerDialog slug={slug} accountId={accountId} lineGroup={lineGroup} layer={dialog.layer} towers={towers} policyOptions={policyOptions} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "participation" ? <ParticipationDialog slug={slug} layer={dialog.layer} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete-layer" || dialog?.kind === "delete-participation"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete-layer" ? `Remove ${dialog.layer.towerLabel} ${layerSummary(dialog.layer).value.label}?` : dialog?.kind === "delete-participation" ? `Remove ${dialog.p.insurer} from this layer?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.kind === "delete-layer" ? "The layer and every insurer line on it are removed. This cannot be undone." : "This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (dialog?.kind === "delete-layer") run(() => deleteTowerLayer(slug, dialog.layer.id), "Layer removed");
                else if (dialog?.kind === "delete-participation") run(() => deleteParticipation(slug, dialog.p.id), `${dialog.p.insurer} removed`);
              }}
            >
              {pending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Tile({ label, value, missing, detail }: { label: string; value: string | null; missing?: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value === null ? <Missing what={missing ?? label} /> : value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

function LayerRows({
  s,
  drafts,
  pending,
  cell,
  onEdit,
  onCancel,
  onChange,
  onSave,
  onDeleteParticipation,
  onAddParticipation,
  onEditLayer,
  onDeleteLayer,
}: {
  s: ReturnType<typeof layerSummary>["value"];
  drafts: Record<string, Draft>;
  pending: boolean;
  cell: string;
  onEdit: (p: ParticipationInput) => void;
  onCancel: (id: string) => void;
  onChange: (id: string, patch: Partial<Draft>) => void;
  onSave: (p: ParticipationInput) => void;
  onDeleteParticipation: (p: ParticipationInput) => void;
  onAddParticipation: () => void;
  onEditLayer: () => void;
  onDeleteLayer: () => void;
}) {
  const inputCls = "h-7 w-24 text-right text-xs";
  return (
    <>
      {s.participations.map((p, i) => {
        const d = drafts[p.id];
        return (
          <tr key={p.id}>
            {i === 0 ? (
              <>
                <td className={`${cell} font-medium`} rowSpan={s.participations.length + 1}>
                  {s.layer.towerLabel}
                </td>
                <td className={cell} rowSpan={s.participations.length + 1}>
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{LAYER_TYPE_LABELS[s.layer.layerType]}</span>
                  <span className="mt-1 flex gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit layer ${s.layer.towerLabel} ${s.label}`} onClick={onEditLayer}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete layer ${s.layer.towerLabel} ${s.label}`} onClick={onDeleteLayer}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </span>
                </td>
              </>
            ) : null}
            <td className={cell}>
              {d ? <Input aria-label="Insurer" value={d.insurer} onChange={(e) => onChange(p.id, { insurer: e.target.value })} className="h-7 w-44 text-xs" /> : p.insurer}
              {p.isLead ? (
                <Badge variant="outline" className="ml-1">
                  Lead
                </Badge>
              ) : null}
            </td>
            <td className={`${cell} text-right`}>{d ? <Input aria-label="Written line %" value={d.written} onChange={(e) => onChange(p.id, { written: e.target.value })} inputMode="decimal" className={inputCls} /> : p.writtenLinePct === null ? <span className="text-muted-foreground">—</span> : pctPts(p.writtenLinePct)}</td>
            <td className={`${cell} text-right`}>{d ? <Input aria-label="Signed line %" value={d.signed} onChange={(e) => onChange(p.id, { signed: e.target.value })} inputMode="decimal" className={inputCls} /> : pctPts(p.signedLinePct)}</td>
            <td className={`${cell} text-right`}>{d ? <Input aria-label="Premium" value={d.premium} onChange={(e) => onChange(p.id, { premium: e.target.value })} inputMode="decimal" className="h-7 w-28 text-right text-xs" /> : formatCurrency(p.premium)}</td>
            <td className={`${cell} text-right`}>{formatCurrency(p.exposedLimit)}</td>
            <td className={`${cell} text-right`}>{p.rateOnLine === null ? "—" : pct(p.rateOnLine, 4)}</td>
            <td className={`${cell} text-right`}>{p.shareOfPremium === null ? "—" : pct(p.shareOfPremium, 1)}</td>
            <td className={`${cell} whitespace-nowrap text-right`}>
              {d ? (
                <>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Save ${p.insurer}`} disabled={pending} onClick={() => onSave(p)}>
                    <Check aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancel editing ${p.insurer}`} onClick={() => onCancel(p.id)}>
                    <X aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${p.insurer} on ${s.layer.towerLabel} ${s.label}`} onClick={() => onEdit(p)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${p.insurer} from ${s.layer.towerLabel} ${s.label}`} onClick={() => onDeleteParticipation(p)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </>
              )}
            </td>
          </tr>
        );
      })}
      <tr className="bg-muted/20">
        {s.participations.length === 0 ? (
          <>
            <td className={`${cell} font-medium`}>{s.layer.towerLabel}</td>
            <td className={cell}>
              <span className="font-medium">{s.label}</span>
              <span className="mt-1 flex gap-1">
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit layer ${s.layer.towerLabel} ${s.label}`} onClick={onEditLayer}>
                  <Pencil aria-hidden="true" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete layer ${s.layer.towerLabel} ${s.label}`} onClick={onDeleteLayer}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </span>
            </td>
          </>
        ) : null}
        <td className={`${cell} text-xs`}>
          <span className="sr-only">
            {s.layer.towerLabel} {s.label}:{" "}
          </span>
          <span className="font-medium">Layer total</span>
          <Button type="button" size="sm" variant="ghost" className="ml-2 h-6 px-2 text-xs" onClick={onAddParticipation}>
            <Plus aria-hidden="true" />
            Add insurer
          </Button>
        </td>
        <td className={`${cell} text-right text-xs`}>{s.layer.participations.some((p) => p.writtenLinePct !== null) ? pctPts(s.layer.participations.reduce((t, p) => t + (p.writtenLinePct ?? 0), 0)) : "—"}</td>
        <td className={`${cell} text-right font-medium`}>
          {pct(s.placedShare, 1)}
          {s.underPlacedPct > 0 ? <span className="block text-xs text-amber-900">short {pctPts(s.underPlacedPct)}</span> : null}
          {s.overPlacedPct > 0 ? <span className="block text-xs text-red-800">over {pctPts(s.overPlacedPct)}</span> : null}
        </td>
        <td className={`${cell} text-right font-medium`}>{formatCurrency(s.layerPremium)}</td>
        <td className={`${cell} text-right font-medium`}>{formatCurrency(s.placedLimit)}</td>
        <td className={`${cell} text-right font-medium`}>{s.rateOnLine === null ? "—" : pct(s.rateOnLine, 4)}</td>
        <td className={`${cell} text-right`}>100%</td>
        <td className={cell} />
      </tr>
    </>
  );
}

function LayerDialog({ slug, accountId, lineGroup, layer, towers, policyOptions, onClose }: { slug: string; accountId: string; lineGroup: LineGroup; layer: ProgramLayerInput | null; towers: string[]; policyOptions: LayerPolicyOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError } = useForm<LayerFormInput, unknown, LayerFormValues>({
    resolver: zodResolver(layerFormSchema),
    defaultValues: layer
      ? { lineGroup, towerLabel: layer.towerLabel, layerType: layer.layerType, attachment: String(layer.attachment), limit: String(layer.limit), policyId: layer.policyId ?? "", notes: layer.notes ?? "" }
      : { lineGroup, towerLabel: towers[0] ?? "Tower 1", layerType: "primary", attachment: "0", limit: "", policyId: "", notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof LayerFormInput) => formState.errors[k]?.message;
  function onSubmit() {
    startTransition(async () => {
      const res = await saveLayer(slug, accountId, layer?.id ?? null, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof LayerFormInput, { message: m });
        return;
      }
      toast.success(layer ? "Layer saved" : "Layer added");
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{layer ? "Edit layer" : "Add layer"}</DialogTitle>
            <DialogDescription>A layer belongs to a tower; name a new tower to split the risk horizontally. Limits are per occurrence. Insurers are added to the layer afterwards.</DialogDescription>
          </DialogHeader>
          <input type="hidden" {...register("lineGroup")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="al-tower" label="Tower" required error={msg("towerLabel")} hint={towers.length ? `Existing: ${towers.join(", ")}` : undefined}>
              <Input {...register("towerLabel")} {...fieldA11y("al-tower", msg("towerLabel"), towers.length ? "hint" : undefined)} list="al-towers" autoComplete="off" />
              <datalist id="al-towers">
                {towers.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field id="al-type" label="Layer type" required error={msg("layerType")}>
              <NativeSelect {...register("layerType")} {...fieldA11y("al-type", msg("layerType"))}>
                {LAYER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LAYER_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="al-attachment" label="Attachment (CAD)" required error={msg("attachment")}>
              <Input {...register("attachment")} {...fieldA11y("al-attachment", msg("attachment"))} inputMode="decimal" />
            </Field>
            <Field id="al-limit" label="Limit (CAD)" required error={msg("limit")}>
              <Input {...register("limit")} {...fieldA11y("al-limit", msg("limit"))} inputMode="decimal" />
            </Field>
            <Field id="al-policy" label="Linked policy" error={msg("policyId")}>
              <NativeSelect {...register("policyId")} {...fieldA11y("al-policy", msg("policyId"))}>
                <option value="">None</option>
                {policyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="al-notes" label="Notes" error={msg("notes")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Input {...register("notes")} {...fieldA11y("al-notes", msg("notes"))} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save layer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ParticipationDialog({ slug, layer, onClose }: { slug: string; layer: ProgramLayerInput; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError } = useForm<ParticipationFormInput, unknown, ParticipationFormValues>({
    resolver: zodResolver(participationFormSchema),
    defaultValues: { insurer: "", writtenLinePct: "", signedLinePct: "", premium: "", policyNumber: "", isLead: layer.participations.length === 0, notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof ParticipationFormInput) => formState.errors[k]?.message;
  function onSubmit() {
    startTransition(async () => {
      const res = await saveParticipation(slug, layer.id, null, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof ParticipationFormInput, { message: m });
        return;
      }
      toast.success("Insurer added");
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              Add insurer to {layer.towerLabel} {layerSummary(layer).value.label}
            </DialogTitle>
            <DialogDescription>Written line is what the insurer offered; signed line is what it kept after sign-down. Leave written blank when lines were signed directly.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ap-insurer" label="Insurer" required error={msg("insurer")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Input {...register("insurer")} {...fieldA11y("ap-insurer", msg("insurer"))} autoComplete="off" />
            </Field>
            <Field id="ap-written" label="Written line (%)" error={msg("writtenLinePct")}>
              <Input {...register("writtenLinePct")} {...fieldA11y("ap-written", msg("writtenLinePct"))} inputMode="decimal" />
            </Field>
            <Field id="ap-signed" label="Signed line (%)" required error={msg("signedLinePct")}>
              <Input {...register("signedLinePct")} {...fieldA11y("ap-signed", msg("signedLinePct"))} inputMode="decimal" />
            </Field>
            <Field id="ap-premium" label="Premium (CAD)" required error={msg("premium")}>
              <Input {...register("premium")} {...fieldA11y("ap-premium", msg("premium"))} inputMode="decimal" />
            </Field>
            <Field id="ap-policy" label="Policy number" error={msg("policyNumber")}>
              <Input {...register("policyNumber")} {...fieldA11y("ap-policy", msg("policyNumber"))} />
            </Field>
            <div className="sm:col-span-2">
              <NativeCheckbox id="ap-lead" label="Lead insurer on this layer" {...register("isLead")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Add insurer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
