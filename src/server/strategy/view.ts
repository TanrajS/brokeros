import "server-only";
import type { LineOfBusiness } from "@/lib/constants";
import { describeRule } from "@/lib/domain/deductibles";
import { layersFor } from "@/server/program/queries";
import {
  DEFAULT_PERMISSIBLE_LOSS_RATIO,
  analyzeRetentionOptions,
  assumptionsAndLimitations,
  automaticOptions,
  considerations,
  defaultTolerances,
  groupClaimsByPolicyYear,
  otherLineRetained,
  selectReplayYears,
  strategyFindings,
  totalCostOfRisk,
  type AutomaticOption,
  type RetentionOption,
  type Tcor,
  type ToleranceSettings,
} from "@/lib/domain/strategy";
import type { LineGroup } from "@/lib/domain/program";
import { formatDate } from "@/lib/format";
import type { Policy, Workspace } from "@/server/db/schema";
import { replaySettingsFrom, settingsFromQuery, type StrategyQuery } from "@/components/strategy/params";
import { listPolicyDeductibles, toRule } from "@/server/deductibles/queries";
import { loadStrategyInputs, toRetentionOption } from "./queries";

export interface OtherLine {
  line: LineOfBusiness;
  carriers: string[];
  premium: number;
  deductible: number | null;
  averageRetained: number | null;
  reason: string | null;
  mathLines: string[];
}

/** One row of the options table: a deductible with its manual (entered by hand) premium, its estimated premium, and which one the comparison used. */
export interface OptionRowView {
  id: string;
  deductible: number;
  label: string;
  carrier: string;
  aggregateCap: number | null;
  manualPremium: number | null;
  manualOptionId: string | null;
  estimated: AutomaticOption | null;
  /** The premium the comparison ran on. */
  premiumUsed: number;
  usedSource: "manual" | "estimated";
  isCurrent: boolean;
}

export const groupForLine = (line: string): LineGroup | null => (line === "General Liability" ? "gl" : line === "Commercial Auto" ? "auto" : line === "Property" ? "property" : null);

/**
 * Everything the Strategy tab, the report and the JSON export share: the policy
 * under analysis, the settings in use, the automatic findings and estimated
 * options, the manual options, retained losses by year, TCOR per option and the generated
 * assumptions.
 */
export async function buildStrategyView(ws: Workspace, accountId: string, q: StrategyQuery) {
  const data = await loadStrategyInputs(ws, accountId);
  if (!data) return null;
  const asOf = ws.asOfDate;
  const superseded = new Set(data.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const inRenewal = (p: Policy) => !superseded.has(p.id) && !data.outcomes.has(p.id) && (p.renewalStatus === "not_started" || p.renewalStatus === "in_progress");
  const hasOptions = (p: Policy) => data.options.some((o) => o.policyId === p.id);
  const byExpiry = (a: Policy, b: Policy) => a.expiryDate.localeCompare(b.expiryDate) || Number(hasOptions(b)) - Number(hasOptions(a)) || a.lineOfBusiness.localeCompare(b.lineOfBusiness);
  const choices = data.policies.filter((p) => inRenewal(p) || hasOptions(p)).sort(byExpiry);
  const policy =
    choices.find((p) => p.id === q.policy) ??
    choices.find((p) => inRenewal(p) && p.expiryDate > asOf) ??
    choices.find((p) => hasOptions(p) && p.expiryDate > asOf) ??
    choices.find(inRenewal) ??
    null;
  if (!policy) return { data, choices, policy: null } as const;

  const line = policy.lineOfBusiness;
  const settings = settingsFromQuery(q);
  const scheduleRows = await listPolicyDeductibles(ws.id, policy.id);
  const schedule = scheduleRows.map(toRule);
  const namedRules = schedule.filter((r) => !r.isDefault);
  const replay = { ...replaySettingsFrom(settings.values), schedule: namedRules };
  const grouped = groupClaimsByPolicyYear(data.claims, data.lrPolicies, line, asOf);
  const years = selectReplayYears(grouped.value, replay).value.years;
  const a = data.account;

  // Tolerances: the account's own figures, else the defaults from revenue.
  const defaults = defaultTolerances(a.annualRevenue).value;
  const perOccurrence = a.toleranceOccurrence ?? defaults.perOccurrence;
  const perYear = a.toleranceYear ?? defaults.perYear;
  const tolerances: ToleranceSettings | null = perOccurrence !== null && perYear !== null ? { perOccurrence, perYear, permissibleLossRatio: a.permissibleLossRatio ?? DEFAULT_PERMISSIBLE_LOSS_RATIO } : null;
  const toleranceDefaults = { occurrence: a.toleranceOccurrence === null, year: a.toleranceYear === null, defaults };

  // The program for this line's group, its TIV, and the renewal this term came from.
  const group = groupForLine(line);
  const groupLayers = group ? layersFor(data.program, group) : [];
  const tiv = policy.insurableValue ?? data.policies.find((p) => groupLayers.some((l) => l.policyId === p.id) && p.insurableValue !== null)?.insurableValue ?? null;
  const predecessor = policy.previousPolicyId ? (data.policies.find((p) => p.id === policy.previousPolicyId) ?? null) : null;
  const latestRenewal = predecessor
    ? { expiring: { premium: predecessor.annualPremium, exposureAmount: predecessor.exposureAmount, exposureBasis: predecessor.exposureBasis }, renewal: { premium: policy.annualPremium, exposureAmount: policy.exposureAmount, exposureBasis: policy.exposureBasis } }
    : null;

  // Manual options and the premium at the current deductible.
  const policyOptions = data.options.filter((o) => o.policyId === policy.id);
  const manual = policyOptions.map(toRetentionOption);
  const currentDeductible = policy.deductible;
  const manualAtCurrent = currentDeductible === null ? null : (manual.find((o) => o.deductible === currentDeductible) ?? null);
  const currentPremium = manualAtCurrent?.premium ?? policy.annualPremium;

  const findings =
    tolerances && currentDeductible !== null
      ? strategyFindings({
          years,
          layers: groupLayers,
          defaultDeductible: currentDeductible,
          tolerances,
          tiv,
          latestRenewal,
          currentPremium,
          schedule: namedRules,
        })
      : null;

  // Estimated premiums for every deductible in play: the automatic set plus the manual ones.
  const estimates =
    tolerances && currentDeductible !== null
      ? automaticOptions({ years, currentDeductible, currentPremium, tolerances, schedule: namedRules, extraDeductibles: manual.map((o) => o.deductible) }).value
      : [];
  const premiumSource: "manual" | "estimated" = q.premiums === "estimated" ? "estimated" : "manual";
  const deductibles = [...new Set([...manual.map((o) => o.deductible), ...estimates.map((e) => e.deductible)])].sort((x, y) => x - y);
  const optionRows: OptionRowView[] = deductibles
    .map((d) => {
      const m = manual.filter((o) => o.deductible === d).sort((x, y) => x.premium - y.premium)[0] ?? null;
      const e = estimates.find((x) => x.deductible === d) ?? null;
      const useManual = premiumSource === "manual" && m !== null;
      const premiumUsed = useManual ? m!.premium : (e?.estimated.premium ?? m?.premium ?? null);
      if (premiumUsed === null) return null;
      return {
        id: m?.id ?? `auto:${d}`,
        deductible: d,
        label: m?.label ?? `$${d.toLocaleString("en-CA")} deductible (estimated)`,
        carrier: m?.carrier ?? policy.carrier,
        aggregateCap: m?.aggregateCap ?? null,
        manualPremium: m?.premium ?? null,
        manualOptionId: m?.id ?? null,
        estimated: e,
        premiumUsed,
        usedSource: useManual ? "manual" : "estimated",
        isCurrent: d === currentDeductible,
      } as OptionRowView;
    })
    .filter((r): r is OptionRowView => r !== null);
  const replayOptions: RetentionOption[] = optionRows.map((r) => ({ id: r.id, label: r.label, carrier: r.carrier, deductible: r.deductible, aggregateCap: r.aggregateCap, premium: r.premiumUsed }));
  const analysis = analyzeRetentionOptions(grouped.value, replayOptions, replay);

  // In force = effective ≤ as-of < expiry, not lost or non-renewed, current term only (the v0.3 rule).
  const inForce = data.policies.filter((p) => !superseded.has(p.id) && p.effectiveDate <= asOf && asOf < p.expiryDate && p.renewalStatus !== "lost" && p.renewalStatus !== "non_renewed");
  const otherPolicies = inForce.filter((p) => p.lineOfBusiness !== line);
  const otherLines: OtherLine[] = [...new Set(otherPolicies.map((p) => p.lineOfBusiness))].map((l) => {
    const rows = otherPolicies.filter((p) => p.lineOfBusiness === l);
    const deductible = rows.map((p) => p.deductible).find((d): d is number => d !== null) ?? null;
    const r = otherLineRetained(data.claims, data.lrPolicies, l, deductible, asOf);
    return { line: l, carriers: [...new Set(rows.map((p) => p.carrier))], premium: rows.reduce((s, p) => s + p.annualPremium, 0), deductible, averageRetained: r.value.averageRetained, reason: r.value.reason, mathLines: r.math.steps.lines as string[] };
  });
  const tcorByOption = analysis.value.options.map((o) =>
    totalCostOfRisk({
      optionLabel: o.option.label,
      premiums: [{ label: line, amount: o.option.premium, substituted: true }, ...otherLines.map((l) => ({ label: l.line, amount: l.premium, substituted: false }))],
      retained: [{ label: line, amount: o.averageRetained, analysed: true }, ...otherLines.map((l) => ({ label: l.line, amount: l.averageRetained, analysed: false }))],
      brokerFees: a.brokerFees,
      riskControlSpend: a.riskControlSpend,
      claimsAdminCost: a.claimsAdminCost,
      revenue: a.annualRevenue,
    }),
  );
  const tcorValues: Tcor[] = tcorByOption.map((t) => t.value);
  const consider = considerations({ years: analysis.value.years, revenue: a.annualRevenue });

  const missing: string[] = [];
  if (a.annualRevenue === null) missing.push("Annual revenue not entered, so TCOR cannot be shown as a share of revenue");
  if (!tolerances) missing.push("Risk tolerances not available: enter annual revenue or set the tolerances on this tab to run the findings");
  if (currentDeductible === null) missing.push(`The ${line} policy has no deductible, so no retention baseline exists`);
  if (optionRows.length === 0) missing.push("No retention options for this policy");
  if (grouped.value.years.length === 0) missing.push(`No ${line} policy periods start on or before ${formatDate(asOf)}`);
  else if (years.every((y) => y.claims.length === 0)) missing.push(`No ${line} claims are recorded in the years used`);
  if (grouped.value.excludedOutsidePeriod > 0) missing.push(`${grouped.value.excludedOutsidePeriod} ${line} claim(s) fall outside every policy period and are excluded`);
  if (group && groupLayers.length === 0) missing.push(`No program layers in the ${line} group, so band and price findings have nothing to read`);
  const linesWithoutLossRuns = otherLines.filter((l) => l.averageRetained === null).map((l) => l.line);
  const accepted = new Set(a.acceptedFindings);
  const assumptions = assumptionsAndLimitations({
    line,
    asOf,
    settings: replay,
    yearsUsed: analysis.value.years.map((y) => ({ label: y.label, current: y.current })),
    omittedYears: analysis.value.omittedYears,
    prospectiveYear: analysis.value.prospectiveYear,
    options: optionRows.map((o) => ({ label: o.label, aggregateCap: o.aggregateCap, source: o.usedSource === "manual" ? "manual" : "estimated" })),
    missing,
    linesWithoutLossRuns,
    scheduleRules: namedRules.map(describeRule),
    tolerances,
    premiumSource,
  });

  return {
    data,
    choices,
    policy,
    line,
    group,
    groupLayers,
    tiv,
    settings,
    replay,
    schedule,
    grouped,
    years,
    policyOptions,
    optionRows,
    premiumSource,
    currentPremium,
    currentDeductible,
    tolerances,
    toleranceDefaults,
    findings,
    accepted,
    analysis,
    inForce,
    otherLines,
    tcorByOption,
    tcorValues,
    considerations: consider,
    missing,
    linesWithoutLossRuns,
    assumptions,
  } as const;
}

export type StrategyView = NonNullable<Awaited<ReturnType<typeof buildStrategyView>>>;
export type StrategyViewWithPolicy = Extract<StrategyView, { policy: Policy }>;
