import { describe, expect, it } from "vitest";
import { lookbackWindow } from "@/lib/domain/dashboard";
import { compareQuotes, marketLog, normaliseQuotes, targetFromExpiring } from "@/lib/domain/marketing";
import { buildDemoBook } from "../demoBookData";
import { demoExpiringTerms, demoMarketSubmissions, demoQuotes } from "../demoBookMarketing";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const harbourGl = book.find((a) => a.name === "Harbourline Foods Inc.")!.policies.find((p) => p.key === "harbour-gl")!;
const expiring = demoExpiringTerms(harbourGl);
const result = compareQuotes(expiring, demoQuotes(harbourGl, asOf), targetFromExpiring(expiring), asOf).value;
const byCarrier = (name: string) => result.quotes.find((c) => c.quote.carrier.startsWith(name))!;

describe("Harbourline GL marketing (hand-verification case)", () => {
  it("has five carriers approached: three quotes, one decline, one outstanding", () => {
    expect(harbourGl.submissions.map((s) => s.status)).toEqual(["quoted", "quoted", "quoted", "declined", "submitted"]);
    expect([expiring.premium, expiring.deductible]).toEqual([150_000, 10_000]);
    expect(result.quotes).toHaveLength(3);
  });

  it("matches the specified premium changes", () => {
    // 142,000 ÷ 150,000 − 1 = −0.053333
    expect(Number(byCarrier("Pacific Crest").premiumChange!.toFixed(4))).toBe(-0.0533);
    // 128,000 ÷ 150,000 − 1 = −0.146667
    expect(Number(byCarrier("Ironwood").premiumChange!.toFixed(4))).toBe(-0.1467);
    // incumbent 158,000 ÷ 150,000 − 1 = +0.053333
    expect(Number(byCarrier("Dominion").premiumChange!.toFixed(4))).toBe(0.0533);
  });

  it("finds Ironwood's two term mismatches and Pacific Crest identical", () => {
    const iw = byCarrier("Ironwood");
    expect([iw.termsMatched, iw.termsCompared]).toEqual([5, 7]);
    expect(iw.mismatches.map((m) => m.term)).toEqual(["deductible", "waiver_of_subrogation"]);
    expect([byCarrier("Pacific Crest").termsMatched, byCarrier("Pacific Crest").termsCompared]).toEqual([7, 7]);
  });

  it("shows commission beside price: Pacific Crest pays the broker more for less client cost", () => {
    // 142,000 × 15% = 21,300 vs incumbent 158,000 × 12.5% = 19,750
    expect([byCarrier("Pacific Crest").commission, byCarrier("Dominion").commission]).toEqual([21_300, 19_750]);
  });

  it("normalises Ironwood out", () => {
    const n = normaliseQuotes(result.quotes).value;
    expect(n.excluded.map((x) => x.comparison.quote.carrier)).toEqual(["Ironwood Specialty (fictional)"]);
    expect(n.included.map((c) => c.quote.carrier).sort()).toEqual(["Dominion Shield Insurance", "Pacific Crest Insurance (fictional)"]);
    expect(n.cheapest).toBe(142_000);
  });
});

describe("demo market log", () => {
  it("flags Maplewood: four submissions, no quotes", () => {
    const log = marketLog(demoMarketSubmissions(book, asOf), lookbackWindow(asOf, 12).value).value;
    const maplewood = log.carriers.find((c) => c.carrier.startsWith("Maplewood"))!;
    expect([maplewood.submissions, maplewood.quotes, maplewood.flagged]).toEqual([4, 0, true]);
    expect(maplewood.declines).toEqual({ class_of_business: 1, capacity: 1, loss_history: 1 });
    // Ironwood: 2 sent, 2 quoted, 0 bound → hit 1.0, bind 0
    const ironwood = log.carriers.find((c) => c.carrier.startsWith("Ironwood"))!;
    expect([ironwood.hitRatio, ironwood.bindRatio]).toEqual([1, 0]);
    expect(log.carriers.filter((c) => c.flagged).map((c) => c.carrier)).toEqual(["Maplewood Underwriters (fictional)"]);
  });
});
