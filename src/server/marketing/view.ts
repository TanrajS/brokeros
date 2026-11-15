import "server-only";
import { compareQuotes, daysToRespond, isQuoteExpired, normaliseQuotes, targetFromExpiring, targetFromRequirement } from "@/lib/domain/marketing";
import type { Policy, Workspace } from "@/server/db/schema";
import type { MarketingQuery } from "@/components/marketing/params";
import { loadMarketingInputs, toExpiringTerms, toQuoteInput } from "./queries";

/**
 * Everything the Marketing tab and the printable summary share: which policy,
 * which target, the comparison and the normalised view. Policies in renewal are
 * current terms (no successor) with no outcome yet; a policy that already has
 * submissions stays selectable after its outcome.
 */
export async function buildMarketingView(ws: Workspace, accountId: string, q: MarketingQuery) {
  const data = await loadMarketingInputs(ws, accountId);
  if (!data) return null;
  const superseded = new Set(data.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const inRenewal = (p: Policy) => !superseded.has(p.id) && !data.outcomes.has(p.id) && (p.renewalStatus === "not_started" || p.renewalStatus === "in_progress");
  const choices = data.policies.filter((p) => inRenewal(p) || data.byPolicy.has(p.id));
  const requested = choices.find((p) => p.id === q.policy);
  // Default (v1.3): the policy with the fewest days to expiry that has no outcome yet; among
  // policies expiring the same day, the one being marketed comes first. Remembered in the URL.
  const byExpiry = (a: Policy, b: Policy) => a.expiryDate.localeCompare(b.expiryDate) || Number(data.byPolicy.has(b.id)) - Number(data.byPolicy.has(a.id)) || a.lineOfBusiness.localeCompare(b.lineOfBusiness);
  const policy =
    requested ??
    choices.filter((p) => inRenewal(p) && p.expiryDate > ws.asOfDate).sort(byExpiry)[0] ??
    // Marketing that just ended in a bind or outcome stays in view before an expired renewal.
    choices.filter((p) => data.byPolicy.has(p.id) && p.expiryDate > ws.asOfDate).sort(byExpiry)[0] ??
    choices.filter(inRenewal).sort(byExpiry)[0] ??
    null;
  if (!policy) return { data, choices, policy: null } as const;

  const subs = data.byPolicy.get(policy.id) ?? [];
  const expiring = toExpiringTerms(policy);
  const requirement = data.requirements.find((r) => r.id === q.target) ?? null;
  const target = requirement ? targetFromRequirement(requirement) : targetFromExpiring(expiring);
  const quoteInputs = subs.flatMap((s) => s.quotes.map((qt) => toQuoteInput(qt, s.submission.carrier)));
  const comparison = compareQuotes(expiring, quoteInputs, target, ws.asOfDate);
  const normalised = normaliseQuotes(comparison.value.quotes);
  const submissionViews = subs.map(({ submission: s, quotes }) => {
    const d = daysToRespond(s.sentOn, s.respondedOn, s.status, ws.asOfDate).value;
    return {
      id: s.id,
      carrier: s.carrier,
      sentOn: s.sentOn,
      respondedOn: s.respondedOn,
      status: s.status,
      declinedReason: s.declinedReason,
      notes: s.notes,
      days: d.days,
      waiting: d.waiting,
      quotes: quotes.map((qt) => ({
        id: qt.id,
        premium: qt.quotedPremium,
        occurrenceLimit: qt.occurrenceLimit,
        aggregateLimit: qt.aggregateLimit,
        deductible: qt.deductible,
        endorsements: qt.endorsements,
        commissionRate: qt.commissionRate,
        exposureAmount: qt.exposureAmount,
        subjectivities: qt.subjectivities,
        validUntil: qt.validUntil,
        isIncumbent: qt.isIncumbentRenewal,
        isBound: qt.isBound,
        expired: isQuoteExpired(qt.validUntil, ws.asOfDate).value,
      })),
    };
  });
  return { data, choices, policy, expiring, requirement, target, comparison, normalised, submissionViews, policyHasOutcome: data.outcomes.has(policy.id) } as const;
}
