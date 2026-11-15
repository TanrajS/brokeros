import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * v1.3: old Placement bookmarks keep working. /placement/<id>/<tab…> goes to
 * /accounts/<id>/<tab…> with its query string; /placement/marketing goes to the
 * workspace market log.
 */
export default async function PlacementRedirect({ params, searchParams }: { params: Promise<{ slug: string; accountId: string; rest?: string[] }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId, rest }, sp] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) for (const x of v) qs.append(k, x);
    else if (v !== undefined) qs.set(k, v);
  }
  const query = qs.toString() ? `?${qs.toString()}` : "";
  if (accountId === "marketing") redirect(`/w/${slug}/market-log${query}`);
  const tail = rest && rest.length ? rest.join("/") : "loss-runs";
  redirect(`/w/${slug}/accounts/${accountId}/${tail}${query}`);
}
