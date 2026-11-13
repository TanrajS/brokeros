/**
 * Maps the pure demo book onto dashboard inputs, so tests can run the seed
 * through the dashboard functions without a database. Pure.
 */
import { checklistTemplate } from "@/lib/domain/renewals";
import type { DashAccount, DashPolicy } from "@/lib/domain/dashboard";
import type { DemoAccount } from "./demoBookData";

export function demoBookToDashboard(book: DemoAccount[]): { accounts: DashAccount[]; policies: DashPolicy[] } {
  const accounts = book.map((a) => ({ id: a.name, name: a.name, producer: a.producer }));
  const policies = book.flatMap((a) =>
    a.policies.map((p): DashPolicy => {
      const o = p.outcome;
      return {
        id: p.key,
        accountId: a.name,
        lineOfBusiness: p.lineOfBusiness,
        carrier: p.carrier,
        effectiveDate: p.effectiveDate,
        expiryDate: p.expiryDate,
        annualPremium: p.annualPremium,
        commissionRate: p.commissionRate,
        renewalStatus: p.renewalStatus,
        outcome: !o
          ? null
          : {
              type: o.type,
              lostReason: o.type === "lost" ? o.lostReason : null,
              reason: o.type === "non_renewed" ? o.reason : null,
              competingPremium: o.type === "lost" ? o.competingPremium : null,
              successorPolicyId: o.type === "renewed" ? o.successorKey : null,
            },
        checklist: p.checklist
          ? { done: p.checklist.filter((c) => c.done).length, total: p.checklist.length }
          : { done: 0, total: checklistTemplate(p.lineOfBusiness).value.length },
      };
    }),
  );
  return { accounts, policies };
}
