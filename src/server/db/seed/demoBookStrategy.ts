/**
 * Maps one demo policy's retention options onto the strategy inputs so tests can
 * run the seed through the optimizer without a database. Pure.
 */
import type { RetentionOption } from "@/lib/domain/strategy";
import type { DemoPolicy } from "./demoBookData";

export function demoRetentionOptions(p: DemoPolicy): RetentionOption[] {
  return p.retentionOptions.map((o, i) => ({
    id: `${p.key}-opt${i}`,
    label: o.label,
    carrier: o.carrier,
    deductible: o.deductible,
    aggregateCap: o.aggregateCap,
    premium: o.premium,
  }));
}
