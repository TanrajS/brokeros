import { z } from "zod";
import { FORWARD_MONTHS, LOOKBACK_MONTHS } from "@/lib/domain/dashboard";

/** "87.5" → 87.5; 0 to 100, up to one decimal place. */
const retentionPercent = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const s = raw.replace(/%$/, "");
    if (!/^\d+(\.\d)?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage such as 87.5" });
      return z.NEVER;
    }
    const n = Number(s);
    if (n > 100) {
      ctx.addIssue({ code: "custom", message: "Retention cannot exceed 100%" });
      return z.NEVER;
    }
    return n;
  });

/** "-5" or "+3.5" → signed percent between −100 and 100, up to one decimal place. */
const signedPercent = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const s = raw.replace(/%$/, "").replace(/^−/, "-").replace(/^\+/, "");
    if (!/^-?\d+(\.\d)?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage such as 5 or -3.5" });
      return z.NEVER;
    }
    const n = Number(s);
    if (n < -100 || n > 100) {
      ctx.addIssue({ code: "custom", message: "Must be between -100 and 100" });
      return z.NEVER;
    }
    return n;
  });

export const forecastAssumptionsSchema = z.object({
  retention: retentionPercent,
  rateChange: signedPercent,
});
export type ForecastAssumptionsInput = z.input<typeof forecastAssumptionsSchema>;
export type ForecastAssumptionsValues = z.output<typeof forecastAssumptionsSchema>;

export function parseLookback(raw: string): (typeof LOOKBACK_MONTHS)[number] {
  const n = Number(raw);
  return (LOOKBACK_MONTHS as readonly number[]).includes(n) ? (n as (typeof LOOKBACK_MONTHS)[number]) : 12;
}

export function parseForward(raw: string): (typeof FORWARD_MONTHS)[number] {
  const n = Number(raw);
  return (FORWARD_MONTHS as readonly number[]).includes(n) ? (n as (typeof FORWARD_MONTHS)[number]) : 12;
}
