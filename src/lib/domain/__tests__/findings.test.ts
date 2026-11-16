import { describe, expect, it } from "vitest";
import type { LRClaim, LRPolicy } from "../lossRuns";
import type { ParticipationInput, ProgramLayerInput } from "../program";
import {
  DEFAULT_REPLAY_SETTINGS,
  analyzeRetentionOptions,
  automaticOptions,
  bandAnalysis,
  defaultTolerances,
  estimatePremium,
  groupClaimsByPolicyYear,
  limitAdequacy,
  modifiers,
  priceFindings,
  selectReplayYears,
  severityPercentile,
  strategyFindings,
  type ToleranceSettings,
} from "../strategy";

const M = 1_000_000;
const asOf = "2026-11-12";
let seq = 0;
/** v1.5: premiums are quoted at 100% of the layer; a single insurer at 100% keeps the same figure. */
const part = (insurer: string, signedLinePct: number, premium100: number, writtenLinePct: number | null = null, isLead = false): ParticipationInput => ({ id: `p${++seq}`, insurer, writtenLinePct, signedLinePct, premium100, policyNumber: null, isLead });
const single = (id: string, layerType: ProgramLayerInput["layerType"], attachment: number, limit: number, premium: number, insurer = "Dominion Shield Insurance", tower = "Tower 1"): ProgramLayerInput => ({
  id,
  towerLabel: tower,
  layerType,
  attachment,
  limit,
  participations: [part(insurer, 100, premium, null, true)],
});

/* Harbourline Foods GL, as seeded (PY2022–PY2026). */
const gl = (id: string, eff: string, exp: string, prev: string | null, premium: number): LRPolicy => ({ id, lineOfBusiness: "General Liability", effectiveDate: eff, expiryDate: exp, annualPremium: premium, exposureBasis: "revenue", exposureAmount: 25 * M, previousPolicyId: prev });
const policies: LRPolicy[] = [gl("py22", "2022-01-11", "2023-01-11", null, 135_000), gl("py23", "2023-01-11", "2024-01-11", "py22", 140_000), gl("py24", "2024-01-11", "2025-01-11", "py23", 145_000), gl("py25", "2025-01-11", "2026-01-11", "py24", 148_000), gl("py26", "2026-01-11", "2027-01-11", "py25", 150_000)];
let cseq = 0;
const claim = (loss: string, paid: number, reserved: number, policyId: string): LRClaim => ({ id: `c${++cseq}`, lineOfBusiness: "General Liability", claimNumber: `GL-${cseq}`, dateOfLoss: loss, dateReported: loss, description: null, paid, reserved, status: reserved > 0 ? "open" : "closed", policyId });
const claims: LRClaim[] = [
  claim("2022-03-14", 8_000, 0, "py22"), claim("2022-07-08", 32_000, 0, "py22"), claim("2022-11-02", 4_500, 0, "py22"),
  claim("2023-04-19", 15_000, 0, "py23"), claim("2023-08-27", 30_000, 90_000, "py23"),
  claim("2024-02-06", 2_000, 0, "py24"), claim("2024-06-18", 6_500, 0, "py24"), claim("2024-10-03", 27_000, 0, "py24"),
  claim("2025-05-22", 12_000, 48_000, "py25"),
  claim("2026-02-14", 9_000, 0, "py26"), claim("2026-06-30", 18_000, 0, "py26"), claim("2026-09-09", 3_000, 0, "py26"),
];
const grouped = groupClaimsByPolicyYear(claims, policies, "General Liability", asOf).value;
const years = selectReplayYears(grouped, DEFAULT_REPLAY_SETTINGS).value.years;
const harbourTower: ProgramLayerInput[] = [single("primary", "primary", 0, 1 * M, 150_000), single("umbrella", "umbrella", 1 * M, 5 * M, 22_000, "Boreal Casualty Company"), single("excess", "excess", 6 * M, 10 * M, 18_000, "Aurora Commercial Underwriters")];
const tolerances: ToleranceSettings = { perOccurrence: 125_000, perYear: 250_000, permissibleLossRatio: 0.65 };

describe("defaultTolerances", () => {
  it("is 0.5% and 1% of revenue, or nothing without revenue", () => {
    // 25,000,000 × 0.5% = 125,000; × 1% = 250,000
    expect(defaultTolerances(25 * M).value).toEqual({ perOccurrence: 125_000, perYear: 250_000 });
    expect(defaultTolerances(null).value).toEqual({ perOccurrence: null, perYear: null });
  });
});

describe("Harbourline: automatic option at the per-occurrence tolerance", () => {
  const options = automaticOptions({ years, currentDeductible: 10_000, currentPremium: 142_000, tolerances }).value;
  const at125k = options.find((o) => o.deductible === 125_000)!;

  it("retains 44,500; 135,000; 35,500; 60,000; 30,000 (average 61,000; worst PY2023 135,000)", () => {
    expect(at125k.source).toBe("tolerance");
    // every Harbourline claim is below 125,000 except none: retained = full incurred each year
    expect(at125k.averageRetained).toBe(61_000); // 305,000 ÷ 5
    expect(at125k.worstYear).toEqual({ label: "PY2023", retained: 135_000 });
    expect(at125k.withinAnnualTolerance).toBe(true); // 135,000 ≤ 250,000
  });

  it("increase vs $10,000 = 42,400; credit 65,231; estimated premium 76,769; expected total cost 137,769", () => {
    // 61,000 − 18,600 = 42,400; 42,400 ÷ 0.65 = 65,230.77 → 65,231; 142,000 − 65,231 = 76,769
    expect(at125k.increaseInRetained).toBe(42_400);
    expect(at125k.estimated.credit).toBe(65_231);
    expect(at125k.estimated.premium).toBe(76_769);
    expect(at125k.estimated.floored).toBe(false);
    // 76,769 + 61,000 = 137,769, and the v1.2 replay agrees when fed the estimated premium
    expect(at125k.estimated.premium + at125k.averageRetained).toBe(137_769);
    const replay = analyzeRetentionOptions(grouped, [
      { id: "cur", label: "$10,000", carrier: "x", deductible: 10_000, aggregateCap: null, premium: 142_000 },
      { id: "auto", label: "$125,000", carrier: "x", deductible: 125_000, aggregateCap: null, premium: at125k.estimated.premium },
    ]).value;
    expect(replay.options[1].years.map((y) => y.retained)).toEqual([44_500, 135_000, 35_500, 60_000, 30_000]);
    expect(replay.options[1].expectedTotalCost).toBe(137_769);
  });

  it("builds the set from the current deductible, the tolerance and the p50/p75/p90 severities, de-duplicated", () => {
    // severities sorted: 2,000 3,000 4,500 6,500 8,000 9,000 15,000 18,000 27,000 32,000 60,000 120,000
    // p50 rank 6 = 9,000 → 10,000 (duplicate of the current); p75 rank 9 = 27,000 → 25,000; p90 rank 11 = 60,000 → 60,000
    expect(options.map((o) => [o.deductible, o.source])).toEqual([
      [10_000, "current"],
      [25_000, "p75"],
      [60_000, "p90"],
      [125_000, "tolerance"],
    ]);
    expect(options[0].increaseInRetained).toBe(0);
    expect(options[0].estimated.premium).toBe(142_000);
  });

  it("the primary $1M band is not a self-insure candidate; the engine raises the deductible candidate instead", () => {
    const r = bandAnalysis({ years, layers: harbourTower, defaultDeductible: 10_000, tolerances }).value;
    const primary = r.bands.find((b) => b.id === "primary")!;
    // band runs from the 10,000 deductible to 1,000,000; in-band = incurred − retained at 10,000: 22,000; 115,000; 17,000; 50,000; 8,000 → 212,000 ÷ 5 = 42,400
    expect([primary.attachment, primary.limit]).toEqual([10_000, 990_000]);
    expect(primary.perYear.map((y) => y.inBand)).toEqual([22_000, 115_000, 17_000, 50_000, 8_000]);
    expect(primary.averageInBand).toBe(42_400);
    expect(primary.classification).toBe("working");
    expect(r.findings.some((f) => f.kind === "self_insure")).toBe(false);
    const raise = r.findings.find((f) => f.kind === "raise_deductible")!;
    expect(raise.title).toBe("Tower 1 $1M primary: candidate to raise the deductible to $125,000");
    // losses between 10,000 and 125,000 are the same 42,400 a year here (no claim exceeds 125,000) → credit 65,231
    expect(raise.estimatedImpact).toBe(65_231);
    expect(raise.evidence[0]).toMatch(/exceeds the \$125,000 per-occurrence tolerance/);
  });

  it("umbrella and excess bands with no in-band losses are catastrophe bands: price comments only", () => {
    const r = bandAnalysis({ years, layers: harbourTower, defaultDeductible: 10_000, tolerances }).value;
    expect(r.bands.filter((b) => b.classification === "catastrophe").map((b) => b.id)).toEqual(["umbrella", "excess"]);
    const cat = r.findings.filter((f) => f.kind === "catastrophe_price");
    expect(cat).toHaveLength(2);
    expect(cat.every((f) => f.estimatedImpact === null && /price discussion only/.test(f.suggestedAction))).toBe(true);
    expect(r.findings.filter((f) => f.kind === "self_insure" || f.kind === "raise_deductible").map((f) => f.id)).toEqual(["raise_deductible:primary"]);
  });

  it("a small working band within both tolerances and priced above its losses is a self-insure candidate", () => {
    // a $50,000 xs $10,000 buffer layer at 40,000: in-band = min(max(incurred − 10,000, 0), 50,000): 22,000; 55,000; 17,000; 50,000; 8,000 → 152,000 ÷ 5 = 30,400
    const buffer = single("buffer", "excess", 10_000, 50_000, 40_000);
    const r = bandAnalysis({ years, layers: [buffer], defaultDeductible: 10_000, tolerances: { perOccurrence: 125_000, perYear: 250_000, permissibleLossRatio: 0.65 } }).value;
    const f = r.findings.find((x) => x.kind === "self_insure")!;
    // 30,400 ÷ 0.65 = 46,769 < 40,000? no: 40,000 < 46,769 → premium is NOT above what losses support → no candidate
    expect(f).toBeUndefined();
    const pricey = bandAnalysis({ years, layers: [{ ...buffer, participations: [part("x", 100, 60_000)] }], defaultDeductible: 10_000, tolerances }).value;
    const g = pricey.findings.find((x) => x.kind === "self_insure")!;
    // 60,000 > 46,769 → candidate; saving 60,000 − 30,400 = 29,600; worst year PY2023 55,000 − 60,000 = −5,000 (still below the premium)
    expect(g.estimatedImpact).toBe(29_600);
    expect(g.caveats[1]).toBe("Even the worst year in the history stayed below the premium.");
  });
});

describe("price findings", () => {
  it("inverted pricing: excess at 0.50% above the umbrella's 0.44% fires; at 0.40% it does not", () => {
    const tower = (excessPremium: number) => [single("p", "primary", 0, 1 * M, 150_000), single("u", "umbrella", 1 * M, 5 * M, 22_000), single("x", "excess", 6 * M, 10 * M, excessPremium)];
    const fired = priceFindings({ layers: tower(50_000) }).value.filter((f) => f.kind === "inverted_pricing");
    // 50,000 ÷ 10,000,000 = 0.50% ≥ 22,000 ÷ 5,000,000 = 0.44%; at 0.44% the excess would cost 44,000 → 6,000 more
    expect(fired).toHaveLength(1);
    expect(fired[0].id).toBe("inverted_pricing:x");
    expect(fired[0].estimatedImpact).toBe(6_000);
    expect(priceFindings({ layers: tower(40_000) }).value.filter((f) => f.kind === "inverted_pricing")).toEqual([]);
  });

  it("line priced above the layer: Maplewood re-priced to 560,000 at 100% (actual 84,000) on PNT's B2 (0.28% vs 0.1544%, 81% above); at 280,000 (actual 42,000) it does not fire", () => {
    const b2 = (maplewood100: number): ProgramLayerInput => ({
      id: "B2",
      towerLabel: "Tower 2",
      layerType: "excess",
      attachment: 100 * M,
      limit: 200 * M,
      participations: [part("Pacific Crest Insurance (fictional)", 25, 300_000, null, true), part("Ironwood Specialty (fictional)", 20, 320_000), part("Maplewood Underwriters (fictional)", 15, maplewood100)],
    });
    const fired = priceFindings({ layers: [b2(560_000)] }).value.filter((f) => f.kind === "line_above_layer");
    // Maplewood: 560,000 ÷ 200M = 84,000 actual ÷ (200M × 15% = 30M) = 0.28%; others (actual): (300,000 × 25% + 320,000 × 20%) ÷ (50M + 40M) = 139,000 ÷ 90,000,000 = 0.1544%; 0.28 ÷ 0.1544 − 1 = 0.813
    expect(fired).toHaveLength(1);
    expect(fired[0].title).toBe("Tower 2 $200M xs $100M: Maplewood Underwriters (fictional)'s line priced above the layer");
    expect(fired[0].evidence[0]).toMatch(/0\.2800% on line vs 0\.1544%/);
    expect(fired[0].evidence[0]).toMatch(/81% above/);
    // at the average, 30,000,000 × 0.0015444 = 46,333; difference 84,000 − 46,333 = 37,667
    expect(fired[0].estimatedImpact).toBe(37_667);
    expect(priceFindings({ layers: [b2(280_000)] }).value.filter((f) => f.kind === "line_above_layer")).toEqual([]);
  });

  it("rate above exposure: a renewal whose rate rose 10 points more than exposure", () => {
    // Cedar: 100,000 on 20M → 108,000 on 23M: rate −6.1% vs exposure +15% → no finding
    const cedar = priceFindings({ layers: [], latestRenewal: { expiring: { premium: 100_000, exposureAmount: 20 * M, exposureBasis: "revenue" }, renewal: { premium: 108_000, exposureAmount: 23 * M, exposureBasis: "revenue" } } }).value;
    expect(cedar).toEqual([]);
    // 100,000 on 20M → 130,000 on 21M: exposure +5%, rate 130,000/21 ÷ 100,000/20 − 1 = 23.8% → gap 18.8 points; exposure-adjusted prior 105,000 → 25,000 more
    const steep = priceFindings({ layers: [], latestRenewal: { expiring: { premium: 100_000, exposureAmount: 20 * M, exposureBasis: "revenue" }, renewal: { premium: 130_000, exposureAmount: 21 * M, exposureBasis: "revenue" } } }).value;
    expect(steep).toHaveLength(1);
    expect(steep[0].kind).toBe("rate_above_exposure");
    expect(steep[0].estimatedImpact).toBe(25_000);
  });
});

describe("limit adequacy", () => {
  const pnt = [single("A", "primary", 0, 300 * M, 310_000, "Westcoast Re (fictional)")];
  it("program top below TIV → underinsured by the gap", () => {
    const f = limitAdequacy(pnt, 350 * M).value!;
    expect([f.kind, f.estimatedImpact]).toEqual(["underinsured", 50 * M]);
  });
  it("program top above TIV by more than 10% → excess limit priced at the top layer's rate", () => {
    // top 300M vs TIV 250M: 50M excess × (310,000 ÷ 300,000,000 = 0.001033) = 51,667
    const f = limitAdequacy(pnt, 250 * M).value!;
    expect([f.kind, f.estimatedImpact]).toEqual(["excess_limit", 51_667]);
    expect(limitAdequacy(pnt, 290 * M).value).toBeNull(); // within 10%
    expect(limitAdequacy(pnt, null).value).toBeNull();
  });
});

describe("estimatePremium and percentiles", () => {
  it("floors the estimate at 25% of the current premium and flags it", () => {
    // 142,000 − 120,000 ÷ 0.65 = 142,000 − 184,615 < 35,500 → floored
    const e = estimatePremium(142_000, 120_000, 0.65).value;
    expect([e.premium, e.credit, e.floored]).toEqual([35_500, 184_615, true]);
    expect(() => estimatePremium(1, 1, 0)).toThrow();
  });
  it("rounds percentiles to $5,000, or $25,000 above $100,000", () => {
    expect(severityPercentile([2_000, 9_000, 27_000, 60_000], 0.5).value).toEqual({ raw: 9_000, rounded: 10_000 });
    expect(severityPercentile([110_000, 140_000, 260_000], 0.9).value).toEqual({ raw: 260_000, rounded: 250_000 });
    expect(severityPercentile([], 0.5).value).toEqual({ raw: null, rounded: null });
  });
});

describe("catastrophe bands and modifiers", () => {
  it("a layer with no in-band losses in five years never produces a retention candidate, whatever the tolerances", () => {
    const high = single("cat", "excess", 1 * M, 5 * M, 22_000);
    const r = bandAnalysis({ years, layers: [high], defaultDeductible: 10_000, tolerances: { perOccurrence: 10 * M, perYear: 10 * M, permissibleLossRatio: 0.65 } }).value;
    expect(r.bands.find((b) => b.id === "cat")!.classification).toBe("catastrophe");
    expect(r.findings.filter((f) => f.kind === "self_insure" || f.kind === "raise_deductible")).toEqual([]);
    expect(r.findings.map((f) => f.kind)).toEqual(["catastrophe_price"]);
  });
  it("states the frequency trend, the open-reserve share and a thin-history warning", () => {
    const m = modifiers(years).value;
    // complete years PY2022–PY2025 counts 3,2 | 3,1 → 2.5 then 2.0 → falling; open reserves 90,000 + 48,000 = 138,000 of 305,000 = 45.2%
    expect(m.find((x) => x.key === "frequency_trend")!.text).toMatch(/falling/);
    expect(m.find((x) => x.key === "open_reserves")!.text).toMatch(/45\.2% of incurred \(\$138,000 of \$305,000\)/);
    expect(m.some((x) => x.key === "few_years")).toBe(false);
    expect(modifiers(years.slice(-2)).value.some((x) => x.key === "few_years")).toBe(true);
  });
  it("strategyFindings sorts by estimated impact with comments last and never uses a decision word", () => {
    const all = strategyFindings({ years, layers: harbourTower, defaultDeductible: 10_000, tolerances, tiv: null, currentPremium: 142_000 }).value;
    expect(all.findings[0].kind).toBe("raise_deductible");
    expect(all.findings.slice(-2).every((f) => f.estimatedImpact === null)).toBe(true);
    for (const f of all.findings) expect(`${f.title} ${f.suggestedAction}`).not.toMatch(/\brecommended\b(?! for discussion)/);
    expect(all.options.map((o) => o.deductible)).toEqual([10_000, 25_000, 60_000, 125_000]);
  });
});

describe("partial-line retention (v1.5)", () => {
  /* Harbourline Foods: single-insurer $1M primary at 142,000 (premium_100 142,000, signed 100%), deductible 10,000,
     tolerances 125,000 per occurrence and 250,000 per year. */
  const primary142 = [single("primary", "primary", 0, 1 * M, 142_000)];
  const r = bandAnalysis({ years, layers: primary142, defaultDeductible: 10_000, tolerances }).value;
  const f = r.findings.find((x) => x.kind === "partial_line")!;

  it("fires a 12% line: saving 17,040, expected retained 5,088, worst-year retained 13,800, net 11,952", () => {
    const band = r.bands.find((b) => b.id === "primary")!;
    // average retained at $1M is 61,000 and at $10,000 is 18,600 → average in-band 42,400; worst year PY2023: 135,000 − 20,000 = 115,000
    expect([band.averageInBand, band.worstYear]).toEqual([42_400, { label: "PY2023", inBand: 115_000 }]);
    // single insurer at 100%: 100% equivalent = 142,000
    expect(band.premium100Equivalent).toBe(142_000);
    expect(f).toBeDefined();
    // largest whole % with line × 990,000 ≤ 125,000 (12.6 → 12) and line × 115,000 ≤ 250,000 (217 → 100): 12%
    expect(f.title).toBe("Tower 1 $1M primary: candidate for the client to retain a 12% line");
    expect(f.suggestedAction).toBe("Candidate: client retains a 12% line of Tower 1 $1M primary alongside the insurers; recommended for discussion.");
    // saving 12% × 142,000 = 17,040; expected retained 12% × 42,400 = 5,088; worst 12% × 115,000 = 13,800; net 17,040 − 5,088 = 11,952
    expect(f.estimatedImpact).toBe(11_952);
    expect(f.evidence[1]).toMatch(/Premium saving \$17,040 a year/);
    expect(f.evidence[1]).toMatch(/expected retained \$5,088\.00/);
    expect(f.evidence[0]).toMatch(/\$13,800 in the worst year \(PY2023\)/);
    expect(f.math.at(-1)).toBe("Saving = 12% × $142,000 = $17,040.00; expected retained = 12% × $42,400.00 = $5,088.00; worst-year retained = 12% × $115,000 = $13,800.00; net expected saving = $17,040.00 − $5,088.00 = $11,952.00");
    // sits beside the raise-deductible candidate for the same band
    expect(r.findings.map((x) => x.id)).toEqual(expect.arrayContaining(["raise_deductible:primary", "partial_line:primary"]));
    // fully placed, so no sentence about the segment's unplaced share
    expect(f.suggestedAction).not.toMatch(/unplaced share/);
  });

  it("with a per-occurrence tolerance of 5,000 the line would be 0% and no candidate appears", () => {
    const tight = bandAnalysis({ years, layers: primary142, defaultDeductible: 10_000, tolerances: { ...tolerances, perOccurrence: 5_000 } }).value;
    // 5,000 ÷ 990,000 = 0.5% → floor 0 → below the 1% minimum
    expect(tight.findings.filter((x) => x.kind === "partial_line")).toEqual([]);
    expect(tight.findings.some((x) => x.kind === "raise_deductible")).toBe(false); // 5,000 < the 10,000 deductible: nothing to raise to
  });

  it("the annual tolerance can bind instead, and the under-placed sentence names the segment shortfall", () => {
    // worst-year in-band 115,000: a 50,000 annual tolerance allows floor(50,000 ÷ 115,000 × 100) = 43%, below the 12% per-occurrence cap, so 12% still wins;
    // at 10,000 a year: floor(10,000 ÷ 115,000 × 100) = 8% binds
    const annual = bandAnalysis({ years, layers: primary142, defaultDeductible: 10_000, tolerances: { ...tolerances, perYear: 10_000 } }).value;
    expect(annual.findings.find((x) => x.kind === "partial_line")!.title).toMatch(/retain an? 8% line/);
    // a 60%-placed layer (single insurer at 60%, 142,000 at 100% → actual 85,200; 100% equivalent 142,000): the segment is 40% short; a 12% line takes it to 28%
    const short = bandAnalysis({ years, layers: [{ ...primary142[0], participations: [part("Solo", 60, 142_000, null, true)] }], defaultDeductible: 10_000, tolerances }).value;
    const g = short.findings.find((x) => x.kind === "partial_line")!;
    expect(short.bands.find((b) => b.id === "primary")!.premium100Equivalent).toBe(142_000);
    expect(g.estimatedImpact).toBe(11_952);
    expect(g.suggestedAction).toMatch(/This line would also reduce the unplaced share of the segment from 40% to 28%\.$/);
  });
});
