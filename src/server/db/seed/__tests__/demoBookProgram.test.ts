import { describe, expect, it } from "vitest";
import { analyzeTower, coinsurancePayment } from "@/lib/domain/program";
import { buildDemoBook } from "../demoBookData";
import { demoAccountToProgram } from "../demoBookProgram";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const account = (name: string) => book.find((a) => a.name === name)!;
const M = 1_000_000;

describe("Harbourline Foods program", () => {
  it("has the specified continuous three-layer tower", () => {
    const { layers } = demoAccountToProgram(account("Harbourline Foods Inc."));
    const t = analyzeTower(layers.filter((_, i) => account("Harbourline Foods Inc.").towerLayers[i].lineGroup === "gl")).value;
    expect(t.continuous).toBe(true);
    expect(t.totalLimit).toBe(16 * M); // 1M + 5M + 10M
    expect(t.layers.map((l) => l.rateOnLine)).toEqual([0.15, 0.0044, 0.0018]);
  });
});

describe("Cedar Ridge program", () => {
  const cedar = account("Cedar Ridge Mechanical Ltd.");
  it("has a two-layer tower with a $1M gap", () => {
    const t = analyzeTower(demoAccountToProgram(cedar).layers).value;
    expect(t.continuous).toBe(false);
    // umbrella attaches at 2M, primary exhausts at 1M → 1M gap
    expect(t.findings).toEqual([expect.objectContaining({ kind: "gap", amount: 1 * M })]);
  });

  it("carries the property adequacy example", () => {
    const pr = cedar.policies.find((p) => p.key === "cedar-pr")!;
    expect([pr.insurableValue, pr.coinsurancePercent, pr.occurrenceLimit, pr.deductible]).toEqual([1 * M, 80, 600_000, 5_000]);
    // with the policy's own $5,000 deductible and a $100,000 loss → payment 70,000, as on the policy page's first load
    const r = coinsurancePayment({ insurableValue: pr.insurableValue!, coinsurancePercent: pr.coinsurancePercent!, carriedLimit: pr.occurrenceLimit!, loss: 100_000, deductible: pr.deductible! }).value;
    expect([r.requiredLimit, r.payment, r.clientAbsorbs, r.additionalLimitNeeded]).toEqual([800_000, 70_000, 30_000, 200_000]);
  });
});
