import type { RenewalFilters } from "@/server/renewals/queries";

export interface RenewalsQuery extends RenewalFilters {
  view: "board" | "list";
  dir: "asc" | "desc";
}

/** Builds a /renewals URL that keeps every filter, so a view can be shared by link. */
export function renewalsHref(slug: string, q: RenewalsQuery, patch: Partial<RenewalsQuery> = {}): string {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  for (const key of ["producer", "manager", "line", "carrier", "stage", "month", "open"] as const) {
    if (next[key]) params.set(key, next[key]);
  }
  if (next.view !== "board") params.set("view", next.view);
  if (next.dir !== "asc") params.set("dir", next.dir);
  const qs = params.toString();
  return `/w/${slug}/renewals${qs ? `?${qs}` : ""}`;
}
