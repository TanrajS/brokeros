/**
 * Program analysis (v1): tower structure, contract requirements, certificate
 * status, property coinsurance and co-insurer participation. Pure: no React,
 * no database, no clock. Every export returns { value, math }.
 */
import type { Endorsement, LineOfBusiness, RenewalStatus } from "@/lib/constants";
import type { Calc, ISODate } from "./types";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

export const LINE_GROUPS = ["gl", "auto"] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];
export const LINE_GROUP_LABELS: Record<LineGroup, string> = { gl: "General Liability with Umbrella/Excess", auto: "Commercial Auto with Umbrella/Excess" };
export const LINE_GROUP_PRIMARY: Record<LineGroup, LineOfBusiness> = { gl: "General Liability", auto: "Commercial Auto" };

export const LAYER_TYPES = ["primary", "umbrella", "excess"] as const;
export type LayerType = (typeof LAYER_TYPES)[number];

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
  const primary = sorted.find((l) => l.layerType === "primary") ?? null;
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
/* Contract requirements                                               */
/* ------------------------------------------------------------------ */

export const REQUIREMENT_COVERAGES = ["General Liability", "Umbrella/Excess", "Commercial Auto", "Workers Compensation"] as const satisfies readonly LineOfBusiness[];
export type RequirementCoverage = (typeof REQUIREMENT_COVERAGES)[number];

export interface RequirementInput {
  id: string;
  contractName: string;
  counterparty: string;
  coverage: RequirementCoverage;
  requiredOccurrence: number | null;
  requiredAggregate: number | null;
  requiredEndorsements: Endorsement[];
}

export interface ProgramPolicy {
  id: string;
  lineOfBusiness: LineOfBusiness;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  endorsements: Endorsement[];
  effectiveDate: ISODate;
  expiryDate: ISODate;
  renewalStatus: RenewalStatus;
  previousPolicyId: string | null;
  /** The as-of date on which a renewed outcome was recorded, or null. */
  renewedOn: ISODate | null;
}

export type RequirementStatus = "meets" | "shortfall" | "missing";
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = { meets: "Meets", shortfall: "Shortfall", missing: "Missing coverage" };

export interface RequirementResult {
  requirement: RequirementInput;
  status: RequirementStatus;
  providedOccurrence: number | null;
  providedAggregate: number | null;
  /** Limit from umbrella and excess layers counted toward occurrence (0 when the option is off). */
  umbrellaCounted: number;
  shortfallOccurrence: number;
  shortfallAggregate: number;
  endorsementsPresent: Endorsement[];
  endorsementsMissing: Endorsement[];
  policyIds: string[];
}

export interface RequirementOptions {
  /** Count umbrella and excess limits toward the per-occurrence requirement. */
  countUmbrella: boolean;
}

/**
 * Compares each requirement with what the account's policies provide.
 * Provided occurrence = the largest occurrence limit among policies in the
 * coverage (plus umbrella/excess tower limit when the option is on); provided
 * aggregate = the largest aggregate limit. Umbrella never counts toward an
 * aggregate. Statutory lines (Workers Compensation) are met by having a policy.
 */
export function checkRequirements(requirements: RequirementInput[], policies: ProgramPolicy[], tower: TowerLayerInput[], options: RequirementOptions): Calc<RequirementResult[]> {
  const umbrellaLimit = sumMoney(tower.filter((l) => l.layerType !== "primary").map((l) => l.limit));
  const lines: string[] = [];
  const value = requirements.map((req): RequirementResult => {
    const inLine = policies.filter((p) => p.lineOfBusiness === req.coverage);
    const maxOrNull = (xs: (number | null)[]) => {
      const nums = xs.filter((x): x is number => x !== null);
      return nums.length ? Math.max(...nums) : null;
    };
    let providedOccurrence = maxOrNull(inLine.map((p) => p.occurrenceLimit));
    const providedAggregate = maxOrNull(inLine.map((p) => p.aggregateLimit));
    // The Umbrella/Excess requirement is met by the tower's umbrella and excess layers, or by an umbrella policy.
    if (req.coverage === "Umbrella/Excess" && umbrellaLimit > 0) providedOccurrence = Math.max(providedOccurrence ?? 0, umbrellaLimit);
    let umbrellaCounted = 0;
    if (options.countUmbrella && req.coverage !== "Umbrella/Excess" && umbrellaLimit > 0 && inLine.length > 0) {
      umbrellaCounted = umbrellaLimit;
      providedOccurrence = sumMoney([providedOccurrence ?? 0, umbrellaLimit]);
    }
    const present = [...new Set(inLine.flatMap((p) => p.endorsements))].filter((e) => req.requiredEndorsements.includes(e));
    const missing = req.requiredEndorsements.filter((e) => !present.includes(e));
    const shortfallOccurrence = req.requiredOccurrence === null ? 0 : Math.max(0, round2(req.requiredOccurrence - (providedOccurrence ?? 0)));
    const shortfallAggregate = req.requiredAggregate === null ? 0 : Math.max(0, round2(req.requiredAggregate - (providedAggregate ?? 0)));
    const hasCoverage = inLine.length > 0 || (req.coverage === "Umbrella/Excess" && umbrellaLimit > 0);
    const status: RequirementStatus = !hasCoverage ? "missing" : shortfallOccurrence > 0 || shortfallAggregate > 0 || missing.length > 0 ? "shortfall" : "meets";
    lines.push(
      `${req.contractName} / ${req.coverage}: ` +
        (!hasCoverage
          ? "no policy in this coverage"
          : `provided ${providedOccurrence === null ? "—" : usd(providedOccurrence)} occurrence` +
            (umbrellaCounted ? ` (including ${usd(umbrellaCounted)} umbrella/excess)` : "") +
            ` / ${providedAggregate === null ? "—" : usd(providedAggregate)} aggregate; required ${req.requiredOccurrence === null ? "statutory" : usd(req.requiredOccurrence)} / ${req.requiredAggregate === null ? "—" : usd(req.requiredAggregate)}; ` +
            `shortfall ${usd(shortfallOccurrence)} / ${usd(shortfallAggregate)}; endorsements missing: ${missing.length ? missing.join(", ") : "none"}`) +
        ` → ${REQUIREMENT_STATUS_LABELS[status]}`,
    );
    return { requirement: req, status, providedOccurrence, providedAggregate, umbrellaCounted, shortfallOccurrence, shortfallAggregate, endorsementsPresent: present, endorsementsMissing: missing, policyIds: inLine.map((p) => p.id) };
  });
  return {
    value,
    math: {
      inputs: { requirements: requirements.length, policies: policies.length, towerLayers: tower.length, options },
      formula: "shortfall = required − provided (floor 0); umbrella/excess limit counts toward occurrence only when the option is on, never toward aggregate",
      steps: { umbrellaLimit, lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Certificates                                                        */
/* ------------------------------------------------------------------ */

export type CertificateStatus = "requested" | "issued" | "expired" | "reissue_needed";
export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  requested: "Requested",
  issued: "Issued",
  expired: "Expired",
  reissue_needed: "Reissue needed",
};

export interface CertificateInput {
  id: string;
  holder: string;
  coverages: LineOfBusiness[];
  requiredBy: ISODate | null;
  issuedOn: ISODate | null;
}

export interface CertificateStatusResult {
  status: CertificateStatus;
  reasons: string[];
  /** Policies the certificate rests on: in force in a requested line on the issue date. */
  underlyingPolicyIds: string[];
}

/**
 * requested: no issue date and the holder's required-by date has not passed.
 * expired: no issue date and required-by is before the as-of date.
 * issued: every underlying policy is still in force at the as-of date and has no successor.
 * reissue_needed: an underlying policy has expired, has been renewed with a successor since the issue date, or a requested line had no policy in force at issuance.
 */
export function certificateStatus(cert: CertificateInput, policies: ProgramPolicy[], asOf: ISODate): Calc<CertificateStatusResult> {
  const reasons: string[] = [];
  let status: CertificateStatus;
  let underlying: ProgramPolicy[] = [];
  if (cert.issuedOn === null) {
    if (cert.requiredBy !== null && cert.requiredBy < asOf) {
      status = "expired";
      reasons.push(`required by ${cert.requiredBy}, before the as-of date ${asOf}, and never issued`);
    } else {
      status = "requested";
      reasons.push(cert.requiredBy ? `not yet issued; required by ${cert.requiredBy}` : "not yet issued");
    }
  } else {
    const issuedOn = cert.issuedOn;
    const successorOf = new Map(policies.filter((p) => p.previousPolicyId).map((p) => [p.previousPolicyId!, p]));
    status = "issued";
    for (const line of cert.coverages) {
      const inForceAtIssue = policies.filter((p) => p.lineOfBusiness === line && p.effectiveDate <= issuedOn && issuedOn < p.expiryDate);
      if (inForceAtIssue.length === 0) {
        status = "reissue_needed";
        reasons.push(`${line}: no policy was in force on the issue date ${issuedOn}`);
        continue;
      }
      for (const p of inForceAtIssue) {
        underlying.push(p);
        if (p.expiryDate <= asOf) {
          status = "reissue_needed";
          reasons.push(`${line}: the underlying policy expired on ${p.expiryDate}`);
        } else if (p.renewedOn !== null && p.renewedOn > issuedOn) {
          status = "reissue_needed";
          const successor = successorOf.get(p.id);
          reasons.push(`${line}: the underlying policy was renewed on ${p.renewedOn}${successor ? ` (successor effective ${successor.effectiveDate})` : ""}`);
        }
      }
    }
    if (status === "issued") reasons.push(`issued ${issuedOn}; every underlying policy is in force on ${asOf}`);
    underlying = [...new Set(underlying)];
  }
  return {
    value: { status, reasons, underlyingPolicyIds: underlying.map((p) => p.id) },
    math: {
      inputs: { holder: cert.holder, coverages: cert.coverages, requiredBy: cert.requiredBy, issuedOn: cert.issuedOn, asOf },
      formula: "requested until issued; expired if required-by passed unissued; issued while underlying policies are in force; reissue needed once one expires or is renewed after the issue date",
      steps: { lines: [`${CERTIFICATE_STATUS_LABELS[status]}: ${reasons.join("; ")}`] },
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
