import type { SortKey } from "./ComparisonTable";

export interface MarketingQuery {
  policy: string;
  /** "" = expiring terms; otherwise a contract requirement id. */
  target: string;
  normalise: boolean;
  sort: SortKey;
}

export function marketingHref(slug: string, accountId: string, q: MarketingQuery, patch: Partial<MarketingQuery> = {}, page: "" | "/summary" = ""): string {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  if (next.policy) params.set("policy", next.policy);
  if (next.target) params.set("target", next.target);
  if (next.normalise) params.set("normalise", "1");
  if (next.sort !== "premium") params.set("sort", next.sort);
  const qs = params.toString();
  return `/w/${slug}/placement/${accountId}/marketing${page}${qs ? `?${qs}` : ""}`;
}

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export function parseMarketingQuery(sp: SP): MarketingQuery {
  const sort = first(sp.sort);
  return {
    policy: first(sp.policy),
    target: first(sp.target),
    normalise: first(sp.normalise) === "1",
    sort: sort === "change" || sort === "commission" || sort === "terms" ? sort : "premium",
  };
}
