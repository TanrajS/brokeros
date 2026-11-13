import { describe, expect, it } from "vitest";
import { DEFAULT_LOSS_RUN_SETTINGS, claimFormSchema, lossRunSettingsSchema } from "../claim";

const asOf = "2026-11-12";
const base = {
  lineOfBusiness: "General Liability",
  policyId: "",
  claimNumber: "DSI-GL-26-001",
  dateOfLoss: "2026-02-14",
  dateReported: "2026-02-16",
  description: "",
  paid: "9,000",
  reserved: "0",
  status: "closed",
  confirmClosedWithReserve: false,
} as const;

describe("claimFormSchema", () => {
  const s = claimFormSchema(asOf);
  it("parses a valid claim", () => {
    const r = s.safeParse(base);
    expect(r.success && r.data).toMatchObject({ paid: 9000, reserved: 0, policyId: null, description: null });
  });
  it("rejects reported before loss and after the as-of date", () => {
    expect(s.safeParse({ ...base, dateReported: "2026-02-13" }).success).toBe(false);
    expect(s.safeParse({ ...base, dateReported: "2026-11-13" }).success).toBe(false);
    expect(s.safeParse({ ...base, dateReported: "2026-11-12" }).success).toBe(true); // on the as-of date is fine
  });
  it("rejects negative or non-numeric amounts", () => {
    expect(s.safeParse({ ...base, paid: "-1" }).success).toBe(false);
    expect(s.safeParse({ ...base, reserved: "lots" }).success).toBe(false);
  });
  it("requires confirmation for a closed claim with a reserve", () => {
    const unconfirmed = s.safeParse({ ...base, reserved: "500" });
    expect(unconfirmed.success).toBe(false);
    if (!unconfirmed.success) expect(unconfirmed.error.issues[0].path).toEqual(["confirmClosedWithReserve"]);
    expect(s.safeParse({ ...base, reserved: "500", confirmClosedWithReserve: true }).success).toBe(true);
    expect(s.safeParse({ ...base, reserved: "500", status: "open" }).success).toBe(true); // open claims need no confirmation
  });
});

describe("lossRunSettingsSchema", () => {
  it("accepts the defaults", () => {
    const r = lossRunSettingsSchema.safeParse(DEFAULT_LOSS_RUN_SETTINGS);
    expect(r.success && r.data).toMatchObject({ trend: 0, ldf12: 1, threshold: 25000, cap: 25000 });
  });
  it("bounds trend and factors", () => {
    expect(lossRunSettingsSchema.safeParse({ ...DEFAULT_LOSS_RUN_SETTINGS, trend: "-60" }).success).toBe(false);
    expect(lossRunSettingsSchema.safeParse({ ...DEFAULT_LOSS_RUN_SETTINGS, trend: "-2.5" }).success).toBe(true);
    expect(lossRunSettingsSchema.safeParse({ ...DEFAULT_LOSS_RUN_SETTINGS, ldf24: "0" }).success).toBe(false);
    expect(lossRunSettingsSchema.safeParse({ ...DEFAULT_LOSS_RUN_SETTINGS, ldf24: "1.15" }).success).toBe(true);
  });
});
