/**
 * The Program summary PDF's content (v1.5), assembled once here so the on-screen
 * figures and the PDF never disagree. Pure: layers, TIV and names in; numbers
 * and labels out. The renderer formats and draws; it computes nothing.
 */
import { COVERAGE_STATUS_LABELS, LAYER_TYPE_LABELS, LINE_GROUP_LABELS, analyzeTower, coverageProfile, programTotals, towerInputsFrom, towerLabels, type CoverageStatus, type LineGroup, type ProgramLayerInput } from "./program";
import type { Calc, ISODate } from "./types";

/** Twelve distinct insurer swatches, assigned in order of first appearance and stable across towers; shared by the tab and the PDF. */
export const INSURER_PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#7c6fd6", "#eb6834", "#52514e", "#0e7490", "#a16207", "#be185d", "#4d7c0f", "#6d28d9"];
/** Placement column fills: dark enough for white text (green 6.6:1, red 7.3:1). */
export const PLACEMENT_FILL = { full: "#0b6b4a", off: "#9b1c1c" } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function longDate(iso: ISODate): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

export interface SummaryInsurer {
  /** "A", "B", … printed inside every segment so no meaning rests on colour alone. */
  key: string;
  name: string;
  color: string;
}

export interface SummarySegmentBlock {
  insurerKey: string;
  insurer: string;
  signedLinePct: number;
  /** Width inside the layer block: signed line ÷ placed share. */
  shareOfPlaced: number;
}

export interface SummaryLayerBlock {
  id: string;
  label: string;
  layerType: string;
  attachment: number;
  exhaustion: number;
  placedShare: number;
  /** "40% placed" */
  placedLabel: string;
  layerPremium: number;
  segments: SummarySegmentBlock[];
}

export interface SummaryCoverageRow {
  from: number;
  to: number;
  layers: string;
  placedShare: number;
  status: CoverageStatus;
  statusLabel: string;
  shortDollars: number;
  blendedRateOnLine: number | null;
}

export interface SummaryParticipationRow {
  kind: "participation";
  tower: string;
  layer: string;
  insurer: string;
  isLead: boolean;
  writtenLinePct: number | null;
  signedLinePct: number;
  premium100: number;
  actualPremium: number;
  exposedLimit: number;
  rateOnLine: number | null;
  shareOfPremium: number | null;
}

export interface SummaryLayerTotalRow {
  kind: "layer_total";
  tower: string;
  layer: string;
  placedShare: number;
  underPlacedPct: number;
  overPlacedPct: number;
  layerPremium: number;
  premium100Equivalent: number | null;
  placedLimit: number;
  rateOnLine: number | null;
}

export interface ProgramSummaryContent {
  title: string;
  accountName: string;
  lineGroupLabel: string;
  asOf: ISODate;
  asOfLabel: string;
  workspaceName: string;
  tiles: { label: string; value: string }[];
  insurers: SummaryInsurer[];
  programTop: number;
  towers: { label: string; layers: SummaryLayerBlock[] }[];
  coverage: SummaryCoverageRow[];
  fullyPlaced: boolean;
  totalShortDollars: number;
  participationRows: (SummaryParticipationRow | SummaryLayerTotalRow)[];
  totals: { programPremium: number; placedLimit: number; tiv: number | null; ratePer100Tiv: number | null };
  findings: string[];
  footer: string;
}

export interface ProgramSummaryInput {
  accountName: string;
  workspaceName: string;
  lineGroup: LineGroup;
  asOf: ISODate;
  layers: ProgramLayerInput[];
  tiv: number | null;
}

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const pctWhole = (share: number) => `${Math.round(share * 100)}%`;
export const insurerKey = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

/** Everything the Program summary PDF prints: title, tiles, the diagram's blocks, both tables and the totals. */
export function programSummaryContent(i: ProgramSummaryInput): Calc<ProgramSummaryContent> {
  const totals = programTotals(i.layers, i.tiv).value;
  const profile = coverageProfile(i.layers, i.tiv).value;
  const names = [...new Set(i.layers.flatMap((l) => l.participations.map((p) => p.insurer)))];
  const insurers: SummaryInsurer[] = names.map((name, k) => ({ key: insurerKey(k), name, color: INSURER_PALETTE[k % INSURER_PALETTE.length] }));
  const keyOf = new Map(insurers.map((x) => [x.name, x.key]));
  const towers = towerLabels(i.layers).map((t) => ({
    label: t,
    layers: totals.layers
      .filter((s) => s.layer.towerLabel === t)
      .map((s) => ({
        id: s.layer.id,
        label: s.label,
        layerType: LAYER_TYPE_LABELS[s.layer.layerType],
        attachment: s.layer.attachment,
        exhaustion: s.exhaustion,
        placedShare: s.placedShare,
        placedLabel: `${pctWhole(s.placedShare)} placed`,
        layerPremium: s.layerPremium,
        segments: s.participations.map((p) => ({ insurerKey: keyOf.get(p.insurer) ?? "?", insurer: p.insurer, signedLinePct: p.signedLinePct, shareOfPlaced: p.shareOfPlaced ?? 0 })),
      })),
  }));
  const coverage: SummaryCoverageRow[] = profile.segments.map((seg, k) => ({
    from: seg.from,
    to: seg.to,
    layers: seg.contributions.map((c) => `${c.towerLabel} ${c.label} ${pctWhole(c.share)}`).join(" + ") || "none",
    placedShare: seg.placedShare,
    status: seg.status,
    statusLabel: COVERAGE_STATUS_LABELS[seg.status],
    shortDollars: seg.unplacedDollars,
    blendedRateOnLine: totals.segments[k]?.blendedRateOnLine ?? null,
  }));
  const participationRows: (SummaryParticipationRow | SummaryLayerTotalRow)[] = totals.layers.flatMap((s) => [
    ...s.participations.map(
      (p): SummaryParticipationRow => ({
        kind: "participation",
        tower: s.layer.towerLabel,
        layer: s.label,
        insurer: p.insurer,
        isLead: p.isLead,
        writtenLinePct: p.writtenLinePct,
        signedLinePct: p.signedLinePct,
        premium100: p.premium100,
        actualPremium: p.actualPremium,
        exposedLimit: p.exposedLimit,
        rateOnLine: p.rateOnLine,
        shareOfPremium: p.shareOfPremium,
      }),
    ),
    { kind: "layer_total", tower: s.layer.towerLabel, layer: s.label, placedShare: s.placedShare, underPlacedPct: s.underPlacedPct, overPlacedPct: s.overPlacedPct, layerPremium: s.layerPremium, premium100Equivalent: s.premium100Equivalent, placedLimit: s.placedLimit, rateOnLine: s.rateOnLine } satisfies SummaryLayerTotalRow,
  ]);
  const findings = towerLabels(i.layers).flatMap((t) => analyzeTower(towerInputsFrom(i.layers.filter((l) => l.towerLabel === t))).value.findings.map((f) => `${t}: ${f.message}`));
  const tiles = [
    { label: "Program premium ($ per year, actual)", value: money0(totals.totalPremium) },
    { label: "Placed limit ($)", value: money0(totals.totalPlacedLimit) },
    { label: "Rate per $100 of TIV", value: totals.ratePer100Tiv === null ? "— (no TIV)" : `$${totals.ratePer100Tiv.toFixed(4)}` },
    { label: "Placed", value: profile.fullyPlaced ? "100% at every point" : `${money0(profile.totalUnplacedDollars)} short` },
  ];
  const value: ProgramSummaryContent = {
    title: "Program summary",
    accountName: i.accountName,
    lineGroupLabel: LINE_GROUP_LABELS[i.lineGroup],
    asOf: i.asOf,
    asOfLabel: longDate(i.asOf),
    workspaceName: i.workspaceName,
    tiles,
    insurers,
    programTop: profile.programTop,
    towers,
    coverage,
    fullyPlaced: profile.fullyPlaced,
    totalShortDollars: profile.totalUnplacedDollars,
    participationRows,
    totals: { programPremium: totals.totalPremium, placedLimit: totals.totalPlacedLimit, tiv: totals.tiv, ratePer100Tiv: totals.ratePer100Tiv },
    findings,
    footer: "All accounts, insurers and figures in this demo are fictional. Premiums are as entered: each insurer's premium is quoted at 100% of its layer; actual premium = 100% premium × signed line. Every layer is read per occurrence.",
  };
  return {
    value,
    math: {
      inputs: { account: i.accountName, lineGroup: i.lineGroup, asOf: i.asOf, layers: i.layers.length, tiv: i.tiv },
      formula: "tiles, blocks and tables are read from programTotals and coverageProfile; segment width = signed line ÷ placed share; nothing else is computed",
      steps: { lines: [`${i.layers.length} layers in ${towers.length} tower(s); program top ${money0(profile.programTop)}; ${insurers.length} insurers keyed ${insurers.map((x) => `${x.key} = ${x.name}`).join(", ") || "none"}`] },
    },
  };
}
