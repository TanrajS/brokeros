/**
 * Program analysis (v1): tower structure, property coinsurance, co-insurer
 * participation and (v1.3) subscription placements. Pure: no React,
 * no database, no clock. Every export returns { value, math }.
 */
import type { LineOfBusiness } from "@/lib/constants";
import type { Calc } from "./types";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

export const LINE_GROUPS = ["gl", "auto", "property"] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];
export const LINE_GROUP_LABELS: Record<LineGroup, string> = { gl: "General Liability with Umbrella/Excess", auto: "Commercial Auto with Umbrella/Excess", property: "Property" };
export const LINE_GROUP_PRIMARY: Record<LineGroup, LineOfBusiness> = { gl: "General Liability", auto: "Commercial Auto", property: "Property" };

export const LAYER_TYPES = ["primary", "umbrella", "excess", "quota_share"] as const;
export type LayerType = (typeof LAYER_TYPES)[number];
export const LAYER_TYPE_LABELS: Record<LayerType, string> = { primary: "Primary", umbrella: "Umbrella", excess: "Excess", quota_share: "Quota share" };
/** A primary or quota-share layer sits at the bottom of a tower; umbrella and excess layers sit above. */
export const isBottomLayer = (t: LayerType) => t === "primary" || t === "quota_share";


function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `${n < 0 ? "−" : ""}$${group(Math.abs(n), 0)}`;
const usd2 = (n: number) => `${n < 0 ? "−" : ""}$${group(Math.abs(n), 2)}`;
const pct = (ratio: number, d = 2) => `${group(ratio * 100, d)}%`;
const r4 = (n: number) => group(n, 4);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sumMoney = (xs: number[]) => xs.reduce((c, x) => c + Math.round(x * 100), 0) / 100;

/* ------------------------------------------------------------------ */
/* Tower                                                               */
/* ------------------------------------------------------------------ */

export interface TowerLayerInput {
  id: string;
  layerType: LayerType;
  attachment: number;
  limit: number;
  premium: number;
  carrier: string;
}

export interface TowerLayerResult extends TowerLayerInput {
  exhaustion: number;
  /** premium ÷ limit, as a fraction (0.0044 = 0.44%). Null when the limit is zero. */
  rateOnLine: number | null;
  premiumPerMillion: number | null;
  /** This layer's rate on line ÷ the primary's. Null without a primary rate. */
  relativeRate: number | null;
  /** "$5M xs $1M" style label. */
  label: string;
}

export type TowerFindingKind = "gap" | "overlap" | "primary_not_at_zero" | "rate_inversion" | "no_primary";

export interface TowerFinding {
  kind: TowerFindingKind;
  /** Layer the finding is about (the upper layer for gaps and overlaps). */
  layerId: string;
  amount: number | null;
  message: string;
}

export interface TowerAnalysis {
  layers: TowerLayerResult[];
  continuous: boolean;
  /** Sum of limits, only when the layers stack without gap or overlap. */
  totalLimit: number | null;
  topExhaustion: number | null;
  findings: TowerFinding[];
}

export function compactDollars(n: number): string {
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${+(n / 1_000).toFixed(1)}K`;
  return `$${+n.toFixed(0)}`;
}

/**
 * Sorts layers by attachment and checks how they stack.
 *   exhaustion = attachment + limit
 *   rate on line = premium ÷ limit
 *   gap = attachment − (layer below's exhaustion) when positive; overlap when negative
 */
export function analyzeTower(input: TowerLayerInput[]): Calc<TowerAnalysis> {
  for (const l of input) {
    if (![l.attachment, l.limit, l.premium].every((n) => Number.isFinite(n) && n >= 0)) throw new Error(`Layer ${l.id}: amounts must be non-negative`);
  }
  const sorted = [...input].sort((a, b) => a.attachment - b.attachment || a.limit - b.limit);
  const primary = sorted.find((l) => isBottomLayer(l.layerType)) ?? null;
  const primaryRate = primary && primary.limit > 0 ? primary.premium / primary.limit : null;
  const lines: string[] = [];

  const layers: TowerLayerResult[] = sorted.map((l) => {
    const exhaustion = sumMoney([l.attachment, l.limit]);
    const rateOnLine = l.limit > 0 ? l.premium / l.limit : null;
    const premiumPerMillion = l.limit > 0 ? round2((l.premium / l.limit) * 1_000_000) : null;
    const relativeRate = rateOnLine !== null && primaryRate ? rateOnLine / primaryRate : null;
    const label = l.attachment === 0 ? `${compactDollars(l.limit)} primary` : `${compactDollars(l.limit)} xs ${compactDollars(l.attachment)}`;
    lines.push(
      `${label} (${l.carrier}): exhaustion ${usd(l.attachment)} + ${usd(l.limit)} = ${usd(exhaustion)}; ` +
        (rateOnLine === null ? "rate on line: no limit" : `rate on line ${usd(l.premium)} ÷ ${usd(l.limit)} = ${r4(rateOnLine)} = ${pct(rateOnLine)}; premium per $1M = ${usd2(premiumPerMillion!)}`) +
        (relativeRate !== null ? `; relative to primary ${r4(rateOnLine!)} ÷ ${r4(primaryRate!)} = ${r4(relativeRate)}×` : ""),
    );
    return { ...l, exhaustion, rateOnLine, premiumPerMillion, relativeRate, label };
  });

  const findings: TowerFinding[] = [];
  if (!primary && layers.length > 0) {
    findings.push({ kind: "no_primary", layerId: layers[0].id, amount: null, message: "No primary layer: the tower starts with an umbrella or excess layer." });
  }
  if (primary && primary.attachment > 0) {
    findings.push({
      kind: "primary_not_at_zero",
      layerId: primary.id,
      amount: primary.attachment,
      message: `The primary attaches at ${usd(primary.attachment)}, not at zero (above the deductible). Check whether a self-insured retention is intended.`,
    });
  }
  let continuous = layers.length > 0;
  for (let i = 1; i < layers.length; i += 1) {
    const below = layers[i - 1];
    const layer = layers[i];
    const diff = round2(layer.attachment - below.exhaustion);
    if (diff > 0) {
      continuous = false;
      findings.push({ kind: "gap", layerId: layer.id, amount: diff, message: `Gap of ${usd(diff)}: ${layer.label} attaches at ${usd(layer.attachment)} but ${below.label} exhausts at ${usd(below.exhaustion)}.` });
      lines.push(`Gap: ${usd(layer.attachment)} − ${usd(below.exhaustion)} = ${usd(diff)}`);
    } else if (diff < 0) {
      continuous = false;
      findings.push({ kind: "overlap", layerId: layer.id, amount: -diff, message: `Overlap of ${usd(-diff)}: ${layer.label} attaches at ${usd(layer.attachment)}, below ${below.label}'s exhaustion of ${usd(below.exhaustion)}.` });
      lines.push(`Overlap: ${usd(below.exhaustion)} − ${usd(layer.attachment)} = ${usd(-diff)}`);
    }
    if (layer.rateOnLine !== null && below.rateOnLine !== null && layer.rateOnLine > below.rateOnLine) {
      findings.push({
        kind: "rate_inversion",
        layerId: layer.id,
        amount: null,
        message: `${layer.label} costs ${pct(layer.rateOnLine)} on line, more than ${below.label} at ${pct(below.rateOnLine)}. Unusual: higher layers normally cost less per dollar of limit. Worth a question to the market.`,
      });
    }
  }
  const totalLimit = continuous ? sumMoney(layers.map((l) => l.limit)) : null;
  const topExhaustion = layers.length ? Math.max(...layers.map((l) => l.exhaustion)) : null;
  lines.push(continuous ? `Continuous: total limit = ${layers.map((l) => usd(l.limit)).join(" + ")} = ${usd(totalLimit!)}` : "Not continuous: no total limit");
  if (topExhaustion !== null) lines.push(`Top of tower = ${usd(topExhaustion)}`);

  return {
    value: { layers, continuous, totalLimit, topExhaustion, findings },
    math: {
      inputs: { layers: input.length },
      formula: "exhaustion = attachment + limit; rate on line = premium ÷ limit; gap = attachment − exhaustion below (positive), overlap (negative)",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Property adequacy (coinsurance)                                     */
/* ------------------------------------------------------------------ */

export interface CoinsuranceInput {
  insurableValue: number;
  /** 80, 90 or 100. */
  coinsurancePercent: number;
  carriedLimit: number;
  loss: number;
  deductible: number;
}

export interface CoinsuranceResult {
  requiredLimit: number;
  underinsured: boolean;
  /** carried ÷ required, capped at 1. */
  recoveryRatio: number;
  penaltyShare: number;
  payment: number;
  clientAbsorbs: number;
  additionalLimitNeeded: number;
}

/**
 * required = value × coinsurance%.
 * If carried ≥ required: payment = min(loss, carried) − deductible.
 * Otherwise: payment = (carried ÷ required) × loss − deductible, capped at carried. Floor zero.
 */
export function coinsurancePayment(i: CoinsuranceInput): Calc<CoinsuranceResult> {
  for (const [k, v] of Object.entries(i)) if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a non-negative number`);
  if (i.coinsurancePercent <= 0 || i.coinsurancePercent > 100) throw new Error("coinsurance percent must be between 0 and 100");
  const requiredLimit = round2(i.insurableValue * (i.coinsurancePercent / 100));
  const underinsured = i.carriedLimit < requiredLimit;
  const recoveryRatio = requiredLimit > 0 ? Math.min(1, i.carriedLimit / requiredLimit) : 1;
  const penaltyShare = underinsured ? round2(1 - recoveryRatio) : 0;
  const lines: string[] = [`Required limit = ${usd(i.insurableValue)} × ${i.coinsurancePercent}% = ${usd(requiredLimit)}`];
  let payment: number;
  if (!underinsured) {
    const covered = Math.min(i.loss, i.carriedLimit);
    payment = Math.max(0, round2(covered - i.deductible));
    lines.push(`Carried ${usd(i.carriedLimit)} ≥ required: payment = min(${usd(i.loss)}, ${usd(i.carriedLimit)}) − ${usd(i.deductible)} = ${usd(payment)}`);
  } else {
    const scaled = round2(recoveryRatio * i.loss);
    payment = Math.max(0, Math.min(i.carriedLimit, round2(scaled - i.deductible)));
    lines.push(
      `Carried ${usd(i.carriedLimit)} < required: payment = (${usd(i.carriedLimit)} ÷ ${usd(requiredLimit)}) × ${usd(i.loss)} − ${usd(i.deductible)} = ${r4(recoveryRatio)} × ${usd(i.loss)} − ${usd(i.deductible)} = ${usd(scaled)} − ${usd(i.deductible)} = ${usd(payment)}, capped at ${usd(i.carriedLimit)}`,
    );
    lines.push(`Penalty share = 1 − ${r4(recoveryRatio)} = ${pct(penaltyShare, 1)}`);
  }
  const clientAbsorbs = round2(i.loss - payment);
  const additionalLimitNeeded = Math.max(0, round2(requiredLimit - i.carriedLimit));
  lines.push(`Client absorbs = ${usd(i.loss)} − ${usd(payment)} = ${usd(clientAbsorbs)}`, `Additional limit to satisfy coinsurance = max(0, ${usd(requiredLimit)} − ${usd(i.carriedLimit)}) = ${usd(additionalLimitNeeded)}`);
  return {
    value: { requiredLimit, underinsured, recoveryRatio, penaltyShare, payment, clientAbsorbs, additionalLimitNeeded },
    math: { inputs: { ...i }, formula: "required = value × coinsurance%; payment = min(loss, carried) − deductible when carried ≥ required, else (carried ÷ required) × loss − deductible capped at carried; floor 0", steps: { lines } },
  };
}

/* ------------------------------------------------------------------ */
/* Co-insurer participation                                            */
/* ------------------------------------------------------------------ */

export interface ParticipantInput {
  id: string;
  carrier: string;
  role: "lead" | "follow";
  /** Percent of the placement, e.g. 50 for 50%. */
  signedLine: number;
  premium: number | null;
}

export interface ParticipantResult extends ParticipantInput {
  /** Share of the limit this participant carries, when a limit is known. */
  limitShare: number | null;
  /** Premium ÷ limit share, as a fraction, when both are known. */
  rateOnLine: number | null;
  /** This participant's premium ÷ the policy premium, to compare with the signed line. */
  premiumShare: number | null;
}

export interface Participation {
  participants: ParticipantResult[];
  totalSignedLine: number;
  totalPremium: number | null;
  /** 100 − total signed line: positive means short-placed, negative over-placed. */
  unplacedLine: number;
  findings: string[];
}

/** Totals a placement's signed lines and premiums and flags lines that do not sum to 100% or premiums that differ from the policy's. */
export function analyzeParticipation(participants: ParticipantInput[], policy: { annualPremium: number; occurrenceLimit: number | null }): Calc<Participation> {
  const totalSignedLine = round2(participants.reduce((s, p) => s + p.signedLine, 0));
  const premiums = participants.map((p) => p.premium);
  const totalPremium = premiums.every((p) => p !== null) && participants.length > 0 ? sumMoney(premiums as number[]) : null;
  const results: ParticipantResult[] = participants.map((p) => {
    const limitShare = policy.occurrenceLimit !== null ? round2(policy.occurrenceLimit * (p.signedLine / 100)) : null;
    return {
      ...p,
      limitShare,
      rateOnLine: p.premium !== null && limitShare ? p.premium / limitShare : null,
      premiumShare: p.premium !== null && policy.annualPremium > 0 ? p.premium / policy.annualPremium : null,
    };
  });
  const findings: string[] = [];
  const unplacedLine = round2(100 - totalSignedLine);
  if (participants.length > 0 && unplacedLine > 0) findings.push(`Signed lines total ${totalSignedLine}%: ${unplacedLine}% of the placement is unplaced.`);
  if (unplacedLine < 0) findings.push(`Signed lines total ${totalSignedLine}%: the placement is over-placed by ${-unplacedLine}%.`);
  if (totalPremium !== null && Math.abs(totalPremium - policy.annualPremium) >= 0.01) {
    findings.push(`Participant premiums total ${usd(totalPremium)}, but the policy premium is ${usd(policy.annualPremium)} (difference ${usd(round2(totalPremium - policy.annualPremium))}).`);
  }
  if (participants.filter((p) => p.role === "lead").length > 1) findings.push("More than one participant is marked as lead.");
  const lines = [
    ...results.map(
      (r) =>
        `${r.carrier} (${r.role}): ${r.signedLine}%` +
        (r.limitShare !== null ? ` of ${usd(policy.occurrenceLimit!)} = ${usd(r.limitShare)}` : "") +
        (r.premium !== null ? `; premium ${usd(r.premium)}` : "") +
        (r.premiumShare !== null ? ` = ${pct(r.premiumShare, 1)} of ${usd(policy.annualPremium)}` : "") +
        (r.rateOnLine !== null ? `; rate on line ${usd(r.premium!)} ÷ ${usd(r.limitShare!)} = ${pct(r.rateOnLine)}` : ""),
    ),
    `Signed lines total ${participants.map((p) => `${p.signedLine}%`).join(" + ") || "0%"} = ${totalSignedLine}%`,
    totalPremium === null ? "Premium total: not every participant has a premium" : `Premiums total ${usd(totalPremium)}`,
  ];
  return {
    value: { participants: results, totalSignedLine, totalPremium, unplacedLine, findings },
    math: { inputs: { participants: participants.length, policyPremium: policy.annualPremium, occurrenceLimit: policy.occurrenceLimit }, formula: "limit share = limit × signed line; premium share = premium ÷ policy premium; rate on line = premium ÷ limit share", steps: { lines } },
  };
}

/* ------------------------------------------------------------------ */
/* Subscription placements (v1.3): signed lines, several towers        */
/* ------------------------------------------------------------------ */

const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
const pctShare = (ratio: number) => `${group(round6(ratio * 100), 2).replace(/\.?0+$/, "")}%`;

export interface ParticipationInput {
  id: string;
  insurer: string;
  /** Line offered, in percent (0–100); null when lines were signed directly. */
  writtenLinePct: number | null;
  /** Line signed, in percent (0–100). */
  signedLinePct: number;
  premium: number;
  policyNumber?: string | null;
  isLead: boolean;
}

export interface ProgramLayerInput {
  id: string;
  towerLabel: string;
  layerType: LayerType;
  attachment: number;
  limit: number;
  /** v1.4: every layer is read per occurrence; the Program tab says so once. */
  participations: ParticipationInput[];
  policyId?: string | null;
  notes?: string | null;
}

export interface ParticipationSummary extends ParticipationInput {
  /** limit × signed line. */
  exposedLimit: number;
  /** premium ÷ exposed limit, as a ratio; null when nothing is exposed. */
  rateOnLine: number | null;
  premiumPerMillion: number | null;
  /** This insurer's premium ÷ the layer premium. */
  shareOfPremium: number | null;
}

export interface LayerSummary {
  layer: ProgramLayerInput;
  label: string;
  exhaustion: number;
  /** Σ signed lines, as a ratio (0.4 = 40%). */
  placedShare: number;
  layerPremium: number;
  /** limit × placed share. */
  placedLimit: number;
  /** layer premium ÷ placed limit; null when nothing is placed. */
  rateOnLine: number | null;
  /** Percentage points short of 100% (0 when fully or over-placed). */
  underPlacedPct: number;
  /** Percentage points above 100%. */
  overPlacedPct: number;
  participations: ParticipationSummary[];
}

export function layerLabel(l: Pick<ProgramLayerInput, "attachment" | "limit" | "layerType">): string {
  return l.attachment === 0 ? `${compactDollars(l.limit)} ${l.layerType === "quota_share" ? "quota share" : "primary"}` : `${compactDollars(l.limit)} xs ${compactDollars(l.attachment)}`;
}

/**
 * One layer of a subscription placement.
 *   placed share = Σ signed lines; layer premium = Σ participation premiums
 *   placed limit = limit × placed share; layer rate on line = layer premium ÷ placed limit
 *   per insurer: exposed limit = limit × signed line; rate on line = premium ÷ exposed limit
 */
export function layerSummary(layer: ProgramLayerInput): Calc<LayerSummary> {
  if (!Number.isFinite(layer.attachment) || layer.attachment < 0 || !Number.isFinite(layer.limit) || layer.limit < 0) throw new Error(`Layer ${layer.id}: attachment and limit must be non-negative`);
  for (const p of layer.participations) {
    if (!Number.isFinite(p.signedLinePct) || p.signedLinePct < 0 || !Number.isFinite(p.premium) || p.premium < 0) throw new Error(`Participation ${p.id}: signed line and premium must be non-negative`);
  }
  const placedShare = round6(layer.participations.reduce((s, p) => s + p.signedLinePct, 0) / 100);
  const layerPremium = sumMoney(layer.participations.map((p) => p.premium));
  const placedLimit = round2(layer.limit * placedShare);
  const rateOnLine = placedLimit > 0 ? layerPremium / placedLimit : null;
  const label = layerLabel(layer);
  const lines: string[] = [
    `${layer.towerLabel}, ${label}: placed share = ${layer.participations.map((p) => pctShare(p.signedLinePct / 100)).join(" + ") || "0%"} = ${pctShare(placedShare)}; layer premium = ${layer.participations.map((p) => usd(p.premium)).join(" + ") || "$0"} = ${usd(layerPremium)}`,
    `${layer.towerLabel}, ${label}: placed limit = ${usd(layer.limit)} × ${pctShare(placedShare)} = ${usd(placedLimit)}; rate on line = ${rateOnLine === null ? "— (nothing placed)" : `${usd(layerPremium)} ÷ ${usd(placedLimit)} = ${r4(rateOnLine)} = ${pct(rateOnLine, 4)}`}`,
  ];
  const participations: ParticipationSummary[] = layer.participations.map((p) => {
    const exposedLimit = round2(layer.limit * (p.signedLinePct / 100));
    const rol = exposedLimit > 0 ? p.premium / exposedLimit : null;
    const perMillion = rol === null ? null : round2(rol * 1_000_000);
    const shareOfPremium = layerPremium > 0 ? p.premium / layerPremium : null;
    lines.push(
      `  ${p.insurer}: exposed limit = ${usd(layer.limit)} × ${pctShare(p.signedLinePct / 100)} = ${usd(exposedLimit)}; rate on line = ${rol === null ? "—" : `${usd(p.premium)} ÷ ${usd(exposedLimit)} = ${pct(rol, 4)}`}; per $1M exposed = ${perMillion === null ? "—" : usd2(perMillion)}; share of layer premium = ${shareOfPremium === null ? "—" : `${usd(p.premium)} ÷ ${usd(layerPremium)} = ${pct(shareOfPremium)}`}`,
    );
    return { ...p, exposedLimit, rateOnLine: rol, premiumPerMillion: perMillion, shareOfPremium };
  });
  const underPlacedPct = placedShare < 1 ? round6((1 - placedShare) * 100) : 0;
  const overPlacedPct = placedShare > 1 ? round6((placedShare - 1) * 100) : 0;
  if (underPlacedPct > 0) lines.push(`${layer.towerLabel}, ${label}: under-placed by ${group(underPlacedPct, 2).replace(/\.?0+$/, "")} points`);
  if (overPlacedPct > 0) lines.push(`${layer.towerLabel}, ${label}: over-placed by ${group(overPlacedPct, 2).replace(/\.?0+$/, "")} points`);
  return {
    value: { layer, label, exhaustion: sumMoney([layer.attachment, layer.limit]), placedShare, layerPremium, placedLimit, rateOnLine, underPlacedPct, overPlacedPct, participations },
    math: {
      inputs: { layer: label, tower: layer.towerLabel, participations: layer.participations.length },
      formula: "placed share = Σ signed lines; layer premium = Σ premiums; placed limit = limit × placed share; rate on line = premium ÷ placed limit (per insurer: ÷ limit × signed line)",
      steps: { lines },
    },
  };
}

export type CoverageStatus = "fully_placed" | "under_placed" | "over_placed" | "not_covered";
export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = { fully_placed: "Fully placed", under_placed: "Under-placed", over_placed: "Over-placed", not_covered: "Not covered" };

export interface CoverageSegment {
  from: number;
  to: number;
  width: number;
  /** Σ signed shares of every layer in every tower covering the segment (ratio). */
  placedShare: number;
  status: CoverageStatus;
  /** Ratio short of 1 (0 unless under-placed or not covered). */
  shortfallShare: number;
  /** Ratio above 1 (0 unless over-placed). */
  excessShare: number;
  /** shortfall share × segment width. */
  unplacedDollars: number;
  contributions: { layerId: string; towerLabel: string; label: string; share: number }[];
}

export interface CoverageProfile {
  programTop: number;
  segments: CoverageSegment[];
  fullyPlaced: boolean;
  totalUnplacedDollars: number;
}

const TOLERANCE = 0.0001; // 0.01 percentage points

/**
 * Cuts 0..programTop into segments at every attachment and exhaustion point and
 * sums the signed shares of every layer (in every tower) covering each segment.
 * programTop defaults to the highest exhaustion; pass the TIV when it differs.
 */
export function coverageProfile(layers: ProgramLayerInput[], programTop: number | null = null): Calc<CoverageProfile> {
  const summaries = layers.map((l) => layerSummary(l).value);
  const highest = summaries.length ? Math.max(...summaries.map((s) => s.exhaustion)) : 0;
  const top = programTop !== null && programTop > 0 ? programTop : highest;
  const cuts = [...new Set([0, top, ...summaries.flatMap((s) => [s.layer.attachment, s.exhaustion])])].filter((x) => x >= 0 && x <= top).sort((a, b) => a - b);
  const lines: string[] = [`Program top = ${usd(top)}${programTop !== null && programTop > 0 ? " (set)" : " (highest exhaustion)"}; cut points: ${cuts.map((c) => usd(c)).join(", ")}`];
  const segments: CoverageSegment[] = [];
  for (let i = 1; i < cuts.length; i += 1) {
    const from = cuts[i - 1];
    const to = cuts[i];
    const width = round2(to - from);
    if (width <= 0) continue;
    const covering = summaries.filter((s) => s.layer.attachment <= from && s.exhaustion >= to);
    const placedShare = round6(covering.reduce((sum, s) => sum + s.placedShare, 0));
    const status: CoverageStatus = covering.length === 0 || placedShare <= 0 ? "not_covered" : Math.abs(placedShare - 1) <= TOLERANCE ? "fully_placed" : placedShare < 1 ? "under_placed" : "over_placed";
    const shortfallShare = status === "fully_placed" || status === "over_placed" ? 0 : round6(1 - placedShare);
    const excessShare = status === "over_placed" ? round6(placedShare - 1) : 0;
    const unplacedDollars = round2(shortfallShare * width);
    lines.push(
      `${usd(from)} to ${usd(to)}: ${covering.length ? covering.map((s) => `${s.layer.towerLabel} ${s.label} ${pctShare(s.placedShare)}`).join(" + ") : "no layer"} = ${pctShare(placedShare)} → ${COVERAGE_STATUS_LABELS[status]}` +
        (shortfallShare > 0 ? `; unplaced = ${pctShare(shortfallShare)} × ${usd(width)} = ${usd(unplacedDollars)}` : "") +
        (excessShare > 0 ? `; excess ${pctShare(excessShare)}` : ""),
    );
    segments.push({ from, to, width, placedShare, status, shortfallShare, excessShare, unplacedDollars, contributions: covering.map((s) => ({ layerId: s.layer.id, towerLabel: s.layer.towerLabel, label: s.label, share: s.placedShare })) });
  }
  return {
    value: { programTop: top, segments, fullyPlaced: segments.length > 0 && segments.every((s) => s.status === "fully_placed"), totalUnplacedDollars: sumMoney(segments.map((s) => s.unplacedDollars)) },
    math: {
      inputs: { layers: layers.length, programTop },
      formula: "placed % per segment = Σ signed shares of every layer covering it; fully placed within 0.01 points; unplaced $ = shortfall × segment width",
      steps: { lines },
    },
  };
}

export interface ProgramTotals {
  totalPremium: number;
  totalPlacedLimit: number;
  tiv: number | null;
  /** total premium ÷ TIV × 100; null without a TIV. */
  ratePer100Tiv: number | null;
  /** Per coverage segment: Σ(layer premium ÷ limit) ÷ Σ placed shares of the layers covering it. */
  segments: { from: number; to: number; blendedRateOnLine: number | null; placedShare: number }[];
  layers: LayerSummary[];
}

/** Program-wide totals: premium, placed limit, rate per $100 of TIV and a blended rate on line per coverage segment. */
export function programTotals(layers: ProgramLayerInput[], tiv: number | null, programTop: number | null = null): Calc<ProgramTotals> {
  const summaries = layers.map((l) => layerSummary(l).value);
  const totalPremium = sumMoney(summaries.map((s) => s.layerPremium));
  const totalPlacedLimit = sumMoney(summaries.map((s) => s.placedLimit));
  const ratePer100Tiv = tiv !== null && tiv > 0 ? round6((totalPremium / tiv) * 100) : null;
  const profile = coverageProfile(layers, programTop ?? (tiv !== null && tiv > 0 ? tiv : null)).value;
  const lines = [
    `Total premium = ${summaries.map((s) => usd(s.layerPremium)).join(" + ") || "$0"} = ${usd(totalPremium)}`,
    `Total placed limit = ${summaries.map((s) => usd(s.placedLimit)).join(" + ") || "$0"} = ${usd(totalPlacedLimit)}`,
    ratePer100Tiv === null ? "Rate per $100 of TIV: — (no TIV)" : `Rate per $100 of TIV = ${usd(totalPremium)} ÷ ${usd(tiv!)} × 100 = ${usd2(ratePer100Tiv).replace(/^\$/, "$")} (${group(ratePer100Tiv, 4)})`,
  ];
  const segments = profile.segments.map((seg) => {
    const covering = summaries.filter((s) => s.layer.attachment <= seg.from && s.exhaustion >= seg.to && s.layer.limit > 0);
    const premiumPerDollar = covering.reduce((sum, s) => sum + s.layerPremium / s.layer.limit, 0);
    const shares = covering.reduce((sum, s) => sum + s.placedShare, 0);
    const blended = shares > 0 ? premiumPerDollar / shares : null;
    lines.push(`${usd(seg.from)} to ${usd(seg.to)}: blended rate on line = (${covering.map((s) => `${usd(s.layerPremium)} ÷ ${usd(s.layer.limit)}`).join(" + ") || "0"}) ÷ ${pctShare(shares)} = ${blended === null ? "—" : pct(blended, 4)}`);
    return { from: seg.from, to: seg.to, blendedRateOnLine: blended, placedShare: seg.placedShare };
  });
  return {
    value: { totalPremium, totalPlacedLimit, tiv, ratePer100Tiv, segments, layers: summaries },
    math: {
      inputs: { layers: layers.length, tiv },
      formula: "total premium = Σ layer premiums; rate per $100 TIV = total premium ÷ TIV × 100; blended rate on line per segment = Σ(premium ÷ limit) ÷ Σ placed shares",
      steps: { lines },
    },
  };
}

export interface SignDownRow {
  insurer: string;
  writtenLinePct: number;
  signedLinePct: number;
}

export interface SignDown {
  targetSharePct: number;
  totalWrittenPct: number;
  /** written × target ÷ total written when over-subscribed; 1 otherwise. */
  scale: number;
  rows: SignDownRow[];
  /** Percentage points the written lines fall short of the target (0 when over-subscribed). */
  underSubscribedPct: number;
}

/**
 * Signs written lines down to a target share. Over-subscribed: signed = written ×
 * target ÷ Σ written. Short: signed = written and the layer is under-subscribed.
 */
export function signDown(participations: { insurer: string; writtenLinePct: number }[], targetSharePct: number): Calc<SignDown> {
  if (!Number.isFinite(targetSharePct) || targetSharePct < 0) throw new Error(`Expected a non-negative target share, received ${targetSharePct}`);
  const totalWrittenPct = round6(participations.reduce((s, p) => s + p.writtenLinePct, 0));
  const over = totalWrittenPct > targetSharePct && totalWrittenPct > 0;
  const scale = over ? targetSharePct / totalWrittenPct : 1;
  const rows = participations.map((p) => ({ insurer: p.insurer, writtenLinePct: p.writtenLinePct, signedLinePct: round6(p.writtenLinePct * scale) }));
  const underSubscribedPct = over ? 0 : round6(targetSharePct - totalWrittenPct);
  const lines = [
    `Written lines total ${group(totalWrittenPct, 2).replace(/\.?0+$/, "")}% against a ${group(targetSharePct, 2).replace(/\.?0+$/, "")}% target → ${over ? `sign down by ${group(targetSharePct, 2).replace(/\.?0+$/, "")} ÷ ${group(totalWrittenPct, 2).replace(/\.?0+$/, "")} = ${r4(scale)}` : `short by ${group(underSubscribedPct, 2).replace(/\.?0+$/, "")} points: lines signed as written`}`,
    ...rows.map((r) => `${r.insurer}: ${group(r.writtenLinePct, 2).replace(/\.?0+$/, "")}% written × ${r4(scale)} = ${group(r.signedLinePct, 2).replace(/\.?0+$/, "")}% signed`),
  ];
  return {
    value: { targetSharePct, totalWrittenPct, scale, rows, underSubscribedPct },
    math: { inputs: { participations, targetSharePct }, formula: "over-subscribed: signed = written × target ÷ Σ written; otherwise signed = written and the shortfall is flagged", steps: { lines } },
  };
}

/** The layers of one tower as the v1 tower analysis expects them: premium = layer premium, carrier = the lead (or the count of insurers). */
export function towerInputsFrom(layers: ProgramLayerInput[]): TowerLayerInput[] {
  return layers.map((l) => {
    const s = layerSummary(l).value;
    const lead = l.participations.find((p) => p.isLead) ?? l.participations[0];
    const carrier = l.participations.length <= 1 ? (lead?.insurer ?? "Unplaced") : `${lead?.insurer ?? "Unplaced"} + ${l.participations.length - 1} more`;
    return { id: l.id, layerType: l.layerType, attachment: l.attachment, limit: l.limit, premium: s.layerPremium, carrier };
  });
}

/** Tower labels in the order they first appear. */
export function towerLabels(layers: ProgramLayerInput[]): string[] {
  return [...new Set(layers.map((l) => l.towerLabel))];
}

/** A program is "advanced" when any layer has several insurers or there is more than one tower. */
export function isAdvancedProgram(layers: ProgramLayerInput[]): boolean {
  return towerLabels(layers).length > 1 || layers.some((l) => l.participations.length > 1);
}

/* ---------- Placement schedule CSV ---------- */

export const PLACEMENT_COLUMNS = ["tower", "layer_type", "attachment", "limit", "insurer", "written_line_pct", "signed_line_pct", "premium", "policy_number"] as const;
export type PlacementColumn = (typeof PLACEMENT_COLUMNS)[number];
/** Columns a schedule must carry; tower, written line and policy number may be blank. */
export const PLACEMENT_REQUIRED_COLUMNS: PlacementColumn[] = ["layer_type", "attachment", "limit", "insurer", "signed_line_pct", "premium"];

export function checkPlacementColumns(headers: string[]): Calc<{ missing: PlacementColumn[]; extra: string[] }> {
  const seen = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = PLACEMENT_REQUIRED_COLUMNS.filter((c) => !seen.has(c));
  const extra = headers.filter((h) => !(PLACEMENT_COLUMNS as readonly string[]).includes(h.trim().toLowerCase()));
  return { value: { missing, extra }, math: { inputs: { headers }, formula: "every required column must be present, in any order", steps: { lines: [missing.length ? `Missing: ${missing.join(", ")}` : "All columns present"] } } };
}

const LAYER_TYPE_ALIASES: Record<string, LayerType> = { primary: "primary", umbrella: "umbrella", excess: "excess", xs: "excess", "quota share": "quota_share", quota_share: "quota_share", qs: "quota_share" };

export interface ParsedPlacementRow {
  towerLabel: string;
  layerType: LayerType;
  attachment: number;
  limit: number;
  insurer: string;
  writtenLinePct: number | null;
  signedLinePct: number;
  premium: number;
  policyNumber: string | null;
}

export interface PlacementRowResult {
  row: number;
  raw: Record<string, string>;
  valid: boolean;
  reasons: string[];
  warnings: string[];
  parsed: ParsedPlacementRow | null;
}

const parsePct = (v: string): number | null => {
  const s = v.trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
};
const parseMoney = (v: string): number | null => {
  const s = v.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
};

/**
 * Validates placement-schedule rows: percentages 0–100, signed not above written
 * when both are present, attachment and limit non-negative (limit above zero),
 * premium non-negative, and the same insurer twice in one layer is invalid.
 */
export function validatePlacementRows(rows: Record<string, string>[]): Calc<PlacementRowResult[]> {
  const seen = new Set<string>();
  const results: PlacementRowResult[] = rows.map((rawIn, i) => {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawIn)) raw[k.trim().toLowerCase()] = (v ?? "").toString().trim();
    const reasons: string[] = [];
    const warnings: string[] = [];
    const towerLabel = raw.tower || "Tower 1";
    const layerType = LAYER_TYPE_ALIASES[(raw.layer_type ?? "").toLowerCase()] ?? null;
    if (!raw.layer_type) reasons.push("missing layer type");
    else if (!layerType) reasons.push(`unknown layer type "${raw.layer_type}" (use primary, umbrella, excess or quota_share)`);
    const attachment = raw.attachment === "" ? null : parseMoney(raw.attachment ?? "");
    if (raw.attachment === undefined || raw.attachment === "") reasons.push("missing attachment");
    else if (attachment === null) reasons.push(`attachment "${raw.attachment}" is not a non-negative amount`);
    const limit = parseMoney(raw.limit ?? "");
    if (!raw.limit) reasons.push("missing limit");
    else if (limit === null) reasons.push(`limit "${raw.limit}" is not a non-negative amount`);
    else if (limit <= 0) reasons.push("limit must be above zero");
    const insurer = raw.insurer ?? "";
    if (!insurer) reasons.push("missing insurer");
    let written: number | null = null;
    if (raw.written_line_pct) {
      written = parsePct(raw.written_line_pct);
      if (written === null || written > 100) {
        reasons.push(`written line "${raw.written_line_pct}" must be a percentage from 0 to 100`);
        written = null;
      }
    }
    const signed = parsePct(raw.signed_line_pct ?? "");
    if (!raw.signed_line_pct) reasons.push("missing signed line");
    else if (signed === null || signed > 100) reasons.push(`signed line "${raw.signed_line_pct}" must be a percentage from 0 to 100`);
    if (written !== null && signed !== null && signed > written) reasons.push(`signed line ${signed}% is above the written line ${written}%`);
    const premium = parseMoney(raw.premium ?? "");
    if (!raw.premium) reasons.push("missing premium");
    else if (premium === null) reasons.push(`premium "${raw.premium}" is not a non-negative amount`);
    if (layerType && attachment !== null && limit !== null && insurer) {
      const key = `${towerLabel.toLowerCase()}|${layerType}|${attachment}|${limit}|${insurer.toLowerCase()}`;
      if (seen.has(key)) reasons.push(`duplicate insurer "${insurer}" in this layer`);
      else seen.add(key);
    }
    const valid = reasons.length === 0;
    return {
      row: i + 1,
      raw,
      valid,
      reasons,
      warnings,
      parsed: valid ? { towerLabel, layerType: layerType!, attachment: attachment!, limit: limit!, insurer, writtenLinePct: written, signedLinePct: signed!, premium: premium!, policyNumber: raw.policy_number ? raw.policy_number : null } : null,
    };
  });
  const validCount = results.filter((r) => r.valid).length;
  return {
    value: results,
    math: {
      inputs: { rows: rows.length },
      formula: "a row is valid with a known layer type, non-negative attachment and limit (limit above zero), an insurer, percentages 0–100 with signed ≤ written, a non-negative premium and no repeated insurer in the layer",
      steps: { lines: [`${validCount} of ${rows.length} rows valid`, ...results.filter((r) => !r.valid).map((r) => `Row ${r.row}: ${r.reasons.join("; ")}`)] },
    },
  };
}

/** Slip-style rows for the CSV export: one line per participation, in the schedule's column order. */
export function placementScheduleRows(layers: ProgramLayerInput[]): (string | number | null)[][] {
  return layers.flatMap((l) => l.participations.map((p) => [l.towerLabel, l.layerType, l.attachment, l.limit, p.insurer, p.writtenLinePct, p.signedLinePct, p.premium, p.policyNumber ?? null]));
}
