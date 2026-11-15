import type { ReplaySettings } from "@/lib/domain/strategy";
import { DEFAULT_STRATEGY_SETTINGS, strategySettingsSchema, type StrategySettingsInput, type StrategySettingsValues } from "@/lib/schemas/strategy";

/** Raw URL parameters for the Strategy tab. Empty string = default. */
export interface StrategyQuery {
  policy: string;
  /** Policy years to replay; "" = 5. */
  years: string;
  /** "0" excludes the running year; "" includes it. */
  current: string;
  /** Trend percent; present means trend is on. */
  trend: string;
  /** Five comma-separated development factors; present means development is on. */
  ldf: string;
  /** "estimated" runs the replay on estimated premiums for every option; "" = manual where one exists. */
  premiums: string;
}

export const EMPTY_STRATEGY_QUERY: StrategyQuery = { policy: "", years: "", current: "", trend: "", ldf: "", premiums: "" };

export function strategyHref(slug: string, accountId: string, q: StrategyQuery, patch: Partial<StrategyQuery> = {}, page: "" | "/report" | "/report/export" = ""): string {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  for (const key of ["policy", "years", "current", "trend", "ldf", "premiums"] as const) if (next[key]) params.set(key, next[key]);
  const qs = params.toString();
  return `/w/${slug}/accounts/${accountId}/strategy${page}${qs ? `?${qs}` : ""}`;
}

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export function parseStrategyQuery(sp: SP): StrategyQuery {
  return { policy: first(sp.policy), years: first(sp.years), current: first(sp.current) === "0" ? "0" : "", trend: first(sp.trend), ldf: first(sp.ldf), premiums: first(sp.premiums) === "estimated" ? "estimated" : "" };
}

/** URL → form input → validated settings. Invalid URL values fall back to the defaults and say so. */
export function settingsFromQuery(q: StrategyQuery): { input: StrategySettingsInput; values: StrategySettingsValues; invalid: boolean } {
  const f = q.ldf ? q.ldf.split(",") : [];
  const input: StrategySettingsInput = {
    years: q.years || DEFAULT_STRATEGY_SETTINGS.years,
    includeCurrent: q.current !== "0",
    trendOn: q.trend !== "",
    trend: q.trend || DEFAULT_STRATEGY_SETTINGS.trend,
    developmentOn: q.ldf !== "",
    ldf12: f[0] ?? DEFAULT_STRATEGY_SETTINGS.ldf12,
    ldf24: f[1] ?? DEFAULT_STRATEGY_SETTINGS.ldf24,
    ldf36: f[2] ?? DEFAULT_STRATEGY_SETTINGS.ldf36,
    ldf48: f[3] ?? DEFAULT_STRATEGY_SETTINGS.ldf48,
    ldf60: f[4] ?? DEFAULT_STRATEGY_SETTINGS.ldf60,
  };
  const parsed = strategySettingsSchema.safeParse(input);
  if (parsed.success) return { input, values: parsed.data, invalid: false };
  return { input: DEFAULT_STRATEGY_SETTINGS, values: strategySettingsSchema.parse(DEFAULT_STRATEGY_SETTINGS), invalid: true };
}

/** Validated settings → URL parameters (only non-default values). */
export function queryFromSettings(v: StrategySettingsValues, policy: string, premiums = ""): StrategyQuery {
  return {
    policy,
    premiums,
    years: v.years === 5 ? "" : String(v.years),
    current: v.includeCurrent ? "" : "0",
    trend: v.trendOn ? String(v.trend) : "",
    ldf: v.developmentOn ? [v.ldf12, v.ldf24, v.ldf36, v.ldf48, v.ldf60].join(",") : "",
  };
}

export function replaySettingsFrom(v: StrategySettingsValues): ReplaySettings {
  return {
    yearsToUse: v.years,
    includeCurrentYear: v.includeCurrent,
    adjustments: {
      trendRate: v.trendOn ? v.trend / 100 : null,
      factors: v.developmentOn ? { "12": v.ldf12, "24": v.ldf24, "36": v.ldf36, "48": v.ldf48, "60+": v.ldf60 } : null,
    },
  };
}
