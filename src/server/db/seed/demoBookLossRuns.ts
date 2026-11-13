/**
 * Maps one demo account onto loss-run inputs so tests can run the seed through
 * the loss-run functions without a database. Pure.
 */
import type { LRClaim, LRPolicy } from "@/lib/domain/lossRuns";
import type { DemoAccount } from "./demoBookData";

export function demoAccountToLossRuns(account: DemoAccount): { policies: LRPolicy[]; claims: LRClaim[] } {
  const policies = account.policies.map((p) => ({
    id: p.key,
    lineOfBusiness: p.lineOfBusiness,
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    annualPremium: p.annualPremium,
    exposureBasis: p.exposureBasis,
    exposureAmount: p.exposureAmount,
    previousPolicyId: p.previousKey,
  }));
  const claims = account.claims.map((c, i) => ({
    id: `c${i}`,
    lineOfBusiness: c.lineOfBusiness,
    claimNumber: c.claimNumber,
    dateOfLoss: c.dateOfLoss,
    dateReported: c.dateReported,
    description: c.description,
    paid: c.paid,
    reserved: c.reserved,
    status: c.status,
    policyId: c.policyKey,
  }));
  return { policies, claims };
}
