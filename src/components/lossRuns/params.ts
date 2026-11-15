import { DEFAULT_LOSS_RUN_SETTINGS, lossRunSettingsSchema, type LossRunSettingsInput, type LossRunSettingsValues } from "@/lib/schemas/claim";
import type { Adjustments } from "@/lib/domain/lossRuns";

/** Raw URL parameters for the Loss Runs tab. Empty string = default / off. */
export interface LossRunQuery {
  line: string;
  /** Trend percent; present means trend is on. */
  trend: string;
  /** Five comma-separated development factors (12, 24, 36, 48, 60+); present means development is on. */
  ldf: string;
  threshold: string;
  cap: string;
}

export function lossRunsHref(slug: string, accountId: string, q: LossRunQuery, patch: Partial<LossRunQuery> = {}): string {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  for (const key of ["line", "trend", "ldf", "threshold", "cap"] as const) if (next[key]) params.set(key, next[key]);
  const qs = params.toString();
  return `/w/${slug}/accounts/${accountId}/loss-runs${qs ? `?${qs}` : ""}`;
}

/** URL → form input → validated settings. Invalid URL values fall back to defaults and say so. */
export function settingsFromQuery(q: LossRunQuery): { input: LossRunSettingsInput; values: LossRunSettingsValues; invalid: boolean } {
  const f = q.ldf ? q.ldf.split(",") : [];
  const input: LossRunSettingsInput = {
    trendOn: q.trend !== "",
    trend: q.trend || DEFAULT_LOSS_RUN_SETTINGS.trend,
    developmentOn: q.ldf !== "",
    ldf12: f[0] ?? DEFAULT_LOSS_RUN_SETTINGS.ldf12,
    ldf24: f[1] ?? DEFAULT_LOSS_RUN_SETTINGS.ldf24,
    ldf36: f[2] ?? DEFAULT_LOSS_RUN_SETTINGS.ldf36,
    ldf48: f[3] ?? DEFAULT_LOSS_RUN_SETTINGS.ldf48,
    ldf60: f[4] ?? DEFAULT_LOSS_RUN_SETTINGS.ldf60,
    threshold: q.threshold || DEFAULT_LOSS_RUN_SETTINGS.threshold,
    cap: q.cap || q.threshold || DEFAULT_LOSS_RUN_SETTINGS.cap,
  };
  const parsed = lossRunSettingsSchema.safeParse(input);
  if (parsed.success) return { input, values: parsed.data, invalid: false };
  const fallback = lossRunSettingsSchema.parse(DEFAULT_LOSS_RUN_SETTINGS);
  return { input: DEFAULT_LOSS_RUN_SETTINGS, values: fallback, invalid: true };
}

/** Validated settings → URL parameters (only non-default values). */
export function queryFromSettings(v: LossRunSettingsValues, line: string): LossRunQuery {
  return {
    line,
    trend: v.trendOn ? String(v.trend) : "",
    ldf: v.developmentOn ? [v.ldf12, v.ldf24, v.ldf36, v.ldf48, v.ldf60].join(",") : "",
    threshold: v.threshold === 25000 ? "" : String(v.threshold),
    cap: v.cap === v.threshold ? "" : String(v.cap),
  };
}

export function adjustmentsFrom(v: LossRunSettingsValues): Adjustments {
  return {
    trendRate: v.trendOn ? v.trend / 100 : null,
    factors: v.developmentOn ? { "12": v.ldf12, "24": v.ldf24, "36": v.ldf36, "48": v.ldf48, "60+": v.ldf60 } : null,
  };
}
