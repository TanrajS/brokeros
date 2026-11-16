import { describe, expect, it } from "vitest";
import type { ParticipationInput, ProgramLayerInput } from "../program";
import { insurerKey, programSummaryContent } from "../programSummary";

const M = 1_000_000;
let seq = 0;
const part = (insurer: string, signedLinePct: number, premium100: number, writtenLinePct: number | null = null, isLead = false): ParticipationInput => ({ id: `p${++seq}`, insurer, writtenLinePct, signedLinePct, premium100, policyNumber: null, isLead });

/* Pacific Northwest Terminals on the 100% basis (v1.5). */
const layers: ProgramLayerInput[] = [
  { id: "A1", towerLabel: "Tower 1", layerType: "primary", attachment: 0, limit: 300 * M, participations: [part("Westcoast Re (fictional)", 15, 800_000, null, true), part("Summit Indemnity (fictional)", 10, 720_000), part("Granville Specialty (fictional)", 10, 780_000), part("Kitsilano Mutual (fictional)", 5, 800_000)] },
  { id: "B1", towerLabel: "Tower 2", layerType: "primary", attachment: 0, limit: 100 * M, participations: [part("Cascadia Mutual (fictional)", 20, 450_000, null, true), part("Northgate Mutual", 10, 480_000), part("Thames Syndicate 2140 (fictional)", 30, 420_000)] },
  { id: "B2", towerLabel: "Tower 2", layerType: "excess", attachment: 100 * M, limit: 200 * M, participations: [part("Pacific Crest Insurance (fictional)", 25, 300_000, null, true), part("Ironwood Specialty (fictional)", 20, 320_000), part("Maplewood Underwriters (fictional)", 15, 280_000)] },
];

describe("programSummaryContent", () => {
  const c = programSummaryContent({ accountName: "Pacific Northwest Terminals Ltd.", workspaceName: "Demo brokerage", lineGroup: "property", asOf: "2026-11-16", layers, tiv: 300 * M }).value;

  it("titles the summary with account, line group, as-of date and workspace", () => {
    expect([c.title, c.accountName, c.lineGroupLabel, c.asOfLabel, c.workspaceName]).toEqual(["Program summary", "Pacific Northwest Terminals Ltd.", "Property", "16 Nov 2026", "Demo brokerage"]);
  });

  it("tiles: program premium 755,000 (actual), placed limit 300M, $0.2517 per $100 of TIV, placed at every point", () => {
    // 310,000 + 264,000 + 181,000 = 755,000; 755,000 ÷ 300,000,000 × 100 = 0.2517
    expect(c.tiles.map((t) => t.value)).toEqual(["$755,000", "$300,000,000", "$0.2517", "100% at every point"]);
  });

  it("draws two towers; Tower 1's block is 40% placed and Westcoast fills 37.5% of it", () => {
    expect(c.towers.map((t) => t.label)).toEqual(["Tower 1", "Tower 2"]);
    const a1 = c.towers[0].layers[0];
    expect(a1.placedLabel).toBe("40% placed");
    // 15% ÷ 40% = 37.5%; keys A–D in order of first appearance
    expect(a1.segments.map((s) => [s.insurerKey, s.shareOfPlaced])).toEqual([["A", 0.375], ["B", 0.25], ["C", 0.25], ["D", 0.125]]);
    expect(c.insurers.map((x) => x.key)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    expect(c.programTop).toBe(300 * M);
  });

  it("carries both tables: 10 participation rows with 100% and actual premiums, 3 layer totals with 100% equivalents", () => {
    const rows = c.participationRows.filter((r) => r.kind === "participation");
    const totals = c.participationRows.filter((r) => r.kind === "layer_total");
    expect(rows).toHaveLength(10);
    expect(totals).toHaveLength(3);
    // Westcoast: 800,000 at 100% × 15% = 120,000
    expect([rows[0].premium100, rows[0].actualPremium, rows[0].exposedLimit]).toEqual([800_000, 120_000, 45 * M]);
    // Tower 1 total: 310,000 ÷ 40% = 775,000; B1 264,000 ÷ 60% = 440,000; B2 181,000 ÷ 60% = 301,666.67
    expect(totals.map((t) => [t.layerPremium, t.premium100Equivalent])).toEqual([
      [310_000, 775_000],
      [264_000, 440_000],
      [181_000, 301_666.67],
    ]);
    expect(c.coverage.map((s) => [s.placedShare, s.statusLabel, s.shortDollars])).toEqual([
      [1, "Fully placed", 0],
      [1, "Fully placed", 0],
    ]);
    expect(c.footer).toMatch(/fictional/);
  });

  it("keys insurers A…Z then AA", () => {
    expect([insurerKey(0), insurerKey(25), insurerKey(26)]).toEqual(["A", "Z", "AA"]);
  });
});
