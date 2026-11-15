import { describe, expect, it } from "vitest";
import {
  analyzeTower,
  coverageProfile,
  isAdvancedProgram,
  layerSummary,
  placementScheduleRows,
  programTotals,
  signDown,
  towerInputsFrom,
  validatePlacementRows,
  type ParticipationInput,
  type ProgramLayerInput,
} from "../program";

const M = 1_000_000;
let seq = 0;
const part = (insurer: string, signedLinePct: number, premium: number, writtenLinePct: number | null = null, isLead = false): ParticipationInput => ({
  id: `p${++seq}`,
  insurer,
  writtenLinePct,
  signedLinePct,
  premium,
  policyNumber: null,
  isLead,
});

/* Pacific Northwest Terminals: TIV $300M placed across two towers. */
const towerOne: ProgramLayerInput = {
  id: "A1",
  towerLabel: "Tower 1",
  layerType: "primary",
  attachment: 0,
  limit: 300 * M,
  basis: "per_occurrence",
  participations: [part("Westcoast Re (fictional)", 15, 120_000, null, true), part("Summit Indemnity (fictional)", 10, 72_000), part("Granville Specialty (fictional)", 10, 78_000), part("Kitsilano Mutual (fictional)", 5, 40_000)],
};
const b1: ProgramLayerInput = {
  id: "B1",
  towerLabel: "Tower 2",
  layerType: "primary",
  attachment: 0,
  limit: 100 * M,
  basis: "per_occurrence",
  participations: [part("Cascadia Mutual (fictional)", 20, 90_000, null, true), part("Northgate Mutual", 10, 48_000), part("Thames Syndicate 2140 (fictional)", 30, 126_000)],
};
const b2: ProgramLayerInput = {
  id: "B2",
  towerLabel: "Tower 2",
  layerType: "excess",
  attachment: 100 * M,
  limit: 200 * M,
  basis: "per_occurrence",
  participations: [part("Pacific Crest Insurance (fictional)", 25, 75_000, null, true), part("Ironwood Specialty (fictional)", 20, 64_000), part("Maplewood Underwriters (fictional)", 15, 42_000)],
};
const layers = [towerOne, b1, b2];

describe("layerSummary", () => {
  it("Tower 1: placed 40%, premium 310,000, Westcoast exposed 45,000,000 at 0.2667% on line", () => {
    const s = layerSummary(towerOne).value;
    // 15 + 10 + 10 + 5 = 40%
    expect(s.placedShare).toBe(0.4);
    // 120,000 + 72,000 + 78,000 + 40,000 = 310,000
    expect(s.layerPremium).toBe(310_000);
    // 300,000,000 × 40% = 120,000,000; 310,000 ÷ 120,000,000 = 0.002583…
    expect(s.placedLimit).toBe(120 * M);
    expect(Number(s.rateOnLine!.toFixed(6))).toBe(0.002583);
    const west = s.participations[0];
    // 300,000,000 × 15% = 45,000,000; 120,000 ÷ 45,000,000 = 0.0026667 = 0.2667%
    expect(west.exposedLimit).toBe(45 * M);
    expect(Number((west.rateOnLine! * 100).toFixed(4))).toBe(0.2667);
    // 120,000 ÷ 45 = 2,666.67 per $1M exposed; 120,000 ÷ 310,000 = 38.71% of the layer premium
    expect(west.premiumPerMillion).toBe(2_666.67);
    expect(Number(west.shareOfPremium!.toFixed(4))).toBe(0.3871);
    expect(s.underPlacedPct).toBe(60);
    expect(s.label).toBe("$300M primary");
  });

  it("B1: placed 60%, premium 264,000, 0.44% on line; B2: 60%, 181,000, 0.1508%", () => {
    const s1 = layerSummary(b1).value;
    // 20 + 10 + 30 = 60; 90,000 + 48,000 + 126,000 = 264,000; 264,000 ÷ 60,000,000 = 0.0044
    expect([s1.placedShare, s1.layerPremium, s1.placedLimit, s1.rateOnLine]).toEqual([0.6, 264_000, 60 * M, 0.0044]);
    const s2 = layerSummary(b2).value;
    // 25 + 20 + 15 = 60; 75,000 + 64,000 + 42,000 = 181,000; 181,000 ÷ 120,000,000 = 0.0015083…
    expect([s2.placedShare, s2.layerPremium, s2.placedLimit]).toEqual([0.6, 181_000, 120 * M]);
    expect(Number((s2.rateOnLine! * 100).toFixed(4))).toBe(0.1508);
    expect(s2.label).toBe("$200M xs $100M");
  });

  it("a single insurer at 100% is the v0.5 special case", () => {
    const s = layerSummary({ id: "x", towerLabel: "Tower 1", layerType: "primary", attachment: 0, limit: 1 * M, basis: "per_occurrence", participations: [part("Dominion Shield Insurance", 100, 150_000)] }).value;
    expect([s.placedShare, s.layerPremium, s.placedLimit, s.rateOnLine, s.underPlacedPct]).toEqual([1, 150_000, 1 * M, 0.15, 0]);
  });

  it("flags over-placement and refuses negative amounts", () => {
    const s = layerSummary({ ...b1, participations: [part("A", 70, 1), part("B", 40, 1)] }).value;
    expect([s.placedShare, s.overPlacedPct]).toEqual([1.1, 10]);
    expect(() => layerSummary({ ...b1, participations: [part("A", -1, 1)] })).toThrow();
  });
});

describe("coverageProfile", () => {
  it("both segments 0–100M and 100M–300M are 100% placed", () => {
    const c = coverageProfile(layers).value;
    expect(c.programTop).toBe(300 * M);
    expect(c.segments.map((s) => [s.from, s.to, s.placedShare, s.status])).toEqual([
      [0, 100 * M, 1, "fully_placed"], // 40% + 60%
      [100 * M, 300 * M, 1, "fully_placed"], // 40% + 60%
    ]);
    expect(c.fullyPlaced).toBe(true);
    expect(c.totalUnplacedDollars).toBe(0);
    expect(c.segments[0].contributions.map((x) => x.towerLabel)).toEqual(["Tower 1", "Tower 2"]);
  });

  it("Pacific Crest at 15% leaves 100M–300M 90% placed with $20,000,000 unplaced", () => {
    const changed = layers.map((l) => (l.id === "B2" ? { ...l, participations: l.participations.map((p) => (p.insurer.startsWith("Pacific") ? { ...p, signedLinePct: 15 } : p)) } : l));
    const c = coverageProfile(changed).value;
    const top = c.segments[1];
    // 40% + (15 + 20 + 15 = 50%) = 90%; shortfall 10% × 200,000,000 = 20,000,000
    expect([top.placedShare, top.status, top.shortfallShare, top.unplacedDollars]).toEqual([0.9, "under_placed", 0.1, 20 * M]);
    expect(c.fullyPlaced).toBe(false);
    expect(c.totalUnplacedDollars).toBe(20 * M);
  });

  it("a TIV above the tower adds a not-covered segment; overlapping towers above 100% are over-placed", () => {
    const c = coverageProfile(layers, 350 * M).value;
    expect(c.segments[2]).toMatchObject({ from: 300 * M, to: 350 * M, status: "not_covered", shortfallShare: 1, unplacedDollars: 50 * M });
    const over = coverageProfile([towerOne, { ...b1, participations: [part("A", 70, 1)] }]).value;
    // 0–100M: 40% + 70% = 110%
    expect(over.segments[0]).toMatchObject({ status: "over_placed", excessShare: 0.1, shortfallShare: 0 });
  });

  it("notes when bases differ", () => {
    const c = coverageProfile([towerOne, { ...b1, basis: "per_location" }]);
    expect(c.value.bases.sort()).toEqual(["per_location", "per_occurrence"]);
    expect((c.math.steps.lines as string[]).some((l) => /Bases differ/.test(l))).toBe(true);
  });
});

describe("programTotals", () => {
  it("program premium 755,000 and $0.2517 per $100 of a $300M TIV", () => {
    const t = programTotals(layers, 300 * M).value;
    // 310,000 + 264,000 + 181,000 = 755,000
    expect(t.totalPremium).toBe(755_000);
    // 120M + 60M + 120M = 300M placed limit
    expect(t.totalPlacedLimit).toBe(300 * M);
    // 755,000 ÷ 300,000,000 × 100 = 0.251667 → $0.2517
    expect(Number(t.ratePer100Tiv!.toFixed(4))).toBe(0.2517);
    // 0–100M blended: (310,000 ÷ 300M + 264,000 ÷ 100M) ÷ (0.4 + 0.6) = 0.0010333 + 0.00264 = 0.3673%
    expect(Number((t.segments[0].blendedRateOnLine! * 100).toFixed(4))).toBe(0.3673);
    // 100M–300M: (310,000 ÷ 300M + 181,000 ÷ 200M) ÷ 1 = 0.0010333 + 0.000905 = 0.1938%
    expect(Number((t.segments[1].blendedRateOnLine! * 100).toFixed(4))).toBe(0.1938);
  });
  it("has no rate per $100 without a TIV", () => {
    expect(programTotals(layers, null).value.ratePer100Tiv).toBeNull();
  });
});

describe("signDown", () => {
  it("written 25 / 15 / 35 to a 60% target signs 20 / 12 / 28", () => {
    const r = signDown([{ insurer: "A", writtenLinePct: 25 }, { insurer: "B", writtenLinePct: 15 }, { insurer: "C", writtenLinePct: 35 }], 60).value;
    // 75 written; scale 60 ÷ 75 = 0.8 → 20, 12, 28
    expect([r.totalWrittenPct, r.scale]).toEqual([75, 0.8]);
    expect(r.rows.map((x) => x.signedLinePct)).toEqual([20, 12, 28]);
    expect(r.underSubscribedPct).toBe(0);
  });
  it("short lines are signed as written and the shortfall is flagged", () => {
    const r = signDown([{ insurer: "A", writtenLinePct: 25 }, { insurer: "B", writtenLinePct: 15 }], 60).value;
    expect(r.rows.map((x) => x.signedLinePct)).toEqual([25, 15]);
    // 60 − 40 = 20 points short
    expect(r.underSubscribedPct).toBe(20);
  });
});

describe("towers and the v0.5 analysis", () => {
  it("feeds each tower to analyzeTower with the layer premium and the lead insurer", () => {
    const inputs = towerInputsFrom([b1, b2]);
    expect(inputs.map((l) => [l.premium, l.carrier])).toEqual([
      [264_000, "Cascadia Mutual (fictional) + 2 more"],
      [181_000, "Pacific Crest Insurance (fictional) + 2 more"],
    ]);
    const t = analyzeTower(inputs).value;
    expect(t.continuous).toBe(true);
    expect(t.totalLimit).toBe(300 * M);
  });
  it("a quota-share layer at zero counts as the bottom of a tower", () => {
    const t = analyzeTower([{ id: "q", layerType: "quota_share", attachment: 0, limit: 10 * M, premium: 50_000, carrier: "A" }]).value;
    expect(t.findings).toEqual([]);
  });
  it("advanced = several towers or several insurers on a layer", () => {
    expect(isAdvancedProgram([towerOne])).toBe(true);
    expect(isAdvancedProgram([{ ...b1, participations: [part("A", 100, 1)] }])).toBe(false);
    expect(isAdvancedProgram([{ ...b1, participations: [part("A", 100, 1)] }, { ...towerOne, participations: [part("B", 100, 1)] }])).toBe(true);
  });
});

describe("validatePlacementRows", () => {
  const row = (over: Record<string, string>) => ({ tower: "Tower 2", layer_type: "excess", attachment: "100000000", limit: "200000000", insurer: "Pacific Crest", written_line_pct: "30", signed_line_pct: "25", premium: "75000", policy_number: "", ...over });
  it("accepts a well-formed row and defaults a blank tower", () => {
    const r = validatePlacementRows([row({ tower: "" })]).value[0];
    expect(r.valid).toBe(true);
    expect(r.parsed).toMatchObject({ towerLabel: "Tower 1", layerType: "excess", attachment: 100 * M, limit: 200 * M, writtenLinePct: 30, signedLinePct: 25, premium: 75_000, policyNumber: null });
  });
  it("rejects bad percentages, signed above written, negative amounts, unknown types and duplicate insurers", () => {
    const rs = validatePlacementRows([
      row({ signed_line_pct: "120" }),
      row({ signed_line_pct: "40" }),
      row({ attachment: "-5" }),
      row({ layer_type: "mezzanine" }),
      row({ insurer: "Dup" }),
      row({ insurer: "dup" }),
      row({ limit: "0" }),
    ]).value;
    expect(rs.map((r) => r.valid)).toEqual([false, false, false, false, true, false, false]);
    expect(rs[0].reasons[0]).toMatch(/0 to 100/);
    expect(rs[1].reasons[0]).toMatch(/above the written line/);
    expect(rs[2].reasons[0]).toMatch(/non-negative/);
    expect(rs[3].reasons[0]).toMatch(/unknown layer type/);
    expect(rs[5].reasons[0]).toMatch(/duplicate insurer/);
    expect(rs[6].reasons[0]).toMatch(/above zero/);
  });
  it("exports one slip row per participation", () => {
    const rows = placementScheduleRows([b1]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["Tower 2", "primary", 0, 100 * M, "Cascadia Mutual (fictional)", null, 20, 90_000, null]);
  });
});
