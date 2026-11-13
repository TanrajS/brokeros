export interface DashboardQuery {
  producer: string;
  lookback: number;
  forward: number;
  /** Raw percent strings from the URL; "" means use the default. */
  retention: string;
  rate: string;
}

/** Builds a /dashboard URL with only non-default parameters, so links stay short and shareable. */
export function dashboardHref(slug: string, q: DashboardQuery, patch: Partial<DashboardQuery> = {}): string {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  if (next.producer) params.set("producer", next.producer);
  if (next.lookback !== 12) params.set("lookback", String(next.lookback));
  if (next.forward !== 12) params.set("forward", String(next.forward));
  if (next.retention) params.set("retention", next.retention);
  if (next.rate) params.set("rate", next.rate);
  const qs = params.toString();
  return `/w/${slug}/dashboard${qs ? `?${qs}` : ""}`;
}
