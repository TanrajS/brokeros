import "server-only";
import { ENDORSEMENT_LABELS, type LineOfBusiness } from "@/lib/constants";
import { isQuoteExpired } from "@/lib/domain/marketing";
import {
  analyzeRetentionOptions,
  assumptionsAndLimitations,
  considerations,
  groupClaimsByPolicyYear,
  otherLineRetained,
  totalCostOfRisk,
  type Tcor,
} from "@/lib/domain/strategy";
import { describeRule } from "@/lib/domain/deductibles";
import { formatCurrency } from "@/lib/format";
import { listPolicyDeductibles, toRule } from "@/server/deductibles/queries";
import type { ContractRequirement, Policy, Workspace } from "@/server/db/schema";
import { replaySettingsFrom, settingsFromQuery, type StrategyQuery } from "@/components/strategy/params";
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

export interface ImportableQuote {
  id: string;
  carrier: string;
  premium: number;
  deductible: number | null;
  expired: boolean;
  alreadyImported: boolean;
}

export function requirementLabel(r: ContractRequirement): string {
  const limits = [r.requiredOccurrence !== null ? `${formatCurrency(r.requiredOccurrence)} per occurrence` : null, r.requiredAggregate !== null ? `${formatCurrency(r.requiredAggregate)} aggregate` : null].filter(Boolean);
  const ends = r.requiredEndorsements.map((e) => ENDORSEMENT_LABELS[e]);
  return `${r.contractName} (${r.counterparty}): ${[...limits, ...ends].join(", ") || "statutory"}`;
}

/**
 * Everything the Strategy tab, the report and the JSON export share: the policy
 * under analysis, the settings in use, the replay, TCOR per option, the
 * considerations and the generated assumptions.
 */
export async function buildStrategyView(ws: Workspace, accountId: string, q: StrategyQuery) {
  const data = await loadStrategyInputs(ws, accountId);
  if (!data) return null;
  const asOf = ws.asOfDate;
  const superseded = new Set(data.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const inRenewal = (p: Policy) => !superseded.has(p.id) && !data.outcomes.has(p.id) && (p.renewalStatus === "not_started" || p.renewalStatus === "in_progress");
  const hasOptions = (p: Policy) => data.options.some((o) => o.policyId === p.id);
  // Default (v1.3): fewest days to expiry with no outcome yet; ties go to the policy that has options. Remembered in the URL.
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
  // v1.3: the policy's deductible schedule; the option stands in for the default rule.
  const scheduleRows = await listPolicyDeductibles(ws.id, policy.id);
  const schedule = scheduleRows.map(toRule);
  const replay = { ...replaySettingsFrom(settings.values), schedule: schedule.filter((r) => !r.isDefault) };
  const grouped = groupClaimsByPolicyYear(data.claims, data.lrPolicies, line, asOf);
  const policyOptions = data.options.filter((o) => o.policyId === policy.id);
  const analysis = analyzeRetentionOptions(grouped.value, policyOptions.map(toRetentionOption), replay);

  // In force = effective ≤ as-of < expiry, not lost or non-renewed, current term only (the v0.3 rule).
  const inForce = data.policies.filter((p) => !superseded.has(p.id) && p.effectiveDate <= asOf && asOf < p.expiryDate && p.renewalStatus !== "lost" && p.renewalStatus !== "non_renewed");
  const otherPolicies = inForce.filter((p) => p.lineOfBusiness !== line);
  const otherLines: OtherLine[] = [...new Set(otherPolicies.map((p) => p.lineOfBusiness))].map((l) => {
    const rows = otherPolicies.filter((p) => p.lineOfBusiness === l);
    const deductible = rows.map((p) => p.deductible).find((d): d is number => d !== null) ?? null;
    const r = otherLineRetained(data.claims, data.lrPolicies, l, deductible, asOf);
    return {
      line: l,
      carriers: [...new Set(rows.map((p) => p.carrier))],
      premium: rows.reduce((s, p) => s + p.annualPremium, 0),
      deductible,
      averageRetained: r.value.averageRetained,
      reason: r.value.reason,
      mathLines: r.math.steps.lines as string[],
    };
  });
  const a = data.account;
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

  const lineRequirements = data.requirements.filter((r) => r.coverage === line);
  const consider = considerations({ years: analysis.value.years, contractRequirements: lineRequirements.map(requirementLabel), revenue: a.annualRevenue });

  const imported = new Set(policyOptions.map((o) => o.sourceQuoteId).filter((x): x is string => x !== null));
  const importable: ImportableQuote[] = (data.byPolicy.get(policy.id) ?? []).flatMap((s) =>
    s.quotes.map((qt) => ({ id: qt.id, carrier: s.submission.carrier, premium: qt.quotedPremium, deductible: qt.deductible, expired: isQuoteExpired(qt.validUntil, asOf).value, alreadyImported: imported.has(qt.id) })),
  );

  const missing: string[] = [];
  if (a.annualRevenue === null) missing.push("Annual revenue not entered, so TCOR cannot be shown as a share of revenue");
  if (policyOptions.length === 0) missing.push("No retention options entered for this policy");
  if (grouped.value.years.length === 0) missing.push(`No ${line} policy periods start on or before the as-of date`);
  else if (analysis.value.years.every((y) => y.claims.length === 0)) missing.push(`No ${line} claims are recorded in the years used`);
  if (grouped.value.excludedOutsidePeriod > 0) missing.push(`${grouped.value.excludedOutsidePeriod} ${line} claim(s) fall outside every policy period and are excluded`);
  const linesWithoutLossRuns = otherLines.filter((l) => l.averageRetained === null).map((l) => l.line);
  const assumptions = assumptionsAndLimitations({
    line,
    asOf,
    settings: replay,
    yearsUsed: analysis.value.years.map((y) => ({ label: y.label, current: y.current })),
    omittedYears: analysis.value.omittedYears,
    prospectiveYear: analysis.value.prospectiveYear,
    options: policyOptions.map((o) => ({ label: o.label, aggregateCap: o.aggregateCap, linkedToQuote: o.sourceQuoteId !== null })),
    missing,
    linesWithoutLossRuns,
    scheduleRules: schedule.filter((r) => !r.isDefault).map(describeRule),
  });

  return {
    data,
    choices,
    policy,
    line,
    settings,
    replay,
    schedule,
    grouped,
    policyOptions,
    analysis,
    inForce,
    otherLines,
    tcorByOption,
    tcorValues,
    considerations: consider,
    lineRequirements,
    importable,
    missing,
    linesWithoutLossRuns,
    assumptions,
  } as const;
}

export type StrategyView = NonNullable<Awaited<ReturnType<typeof buildStrategyView>>>;
export type StrategyViewWithPolicy = Extract<StrategyView, { policy: Policy }>;
