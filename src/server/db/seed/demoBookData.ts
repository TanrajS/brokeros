/**
 * The fictional demo book, built relative to an as-of date so the day offsets
 * always hold. Pure data: no database, no clock.
 *
 * Every company, carrier, person and email here is invented. Any resemblance to
 * a real insurer or business is coincidental.
 */
import { addDays, addMonths, daysBetween } from "@/lib/domain/dates";
import { STANDARD_RENEWAL_TASKS, checklistTemplate, planSuccessorTerm } from "@/lib/domain/renewals";
import type { ISODate } from "@/lib/domain/types";
import type {
  AccountStatus,
  Endorsement,
  ExposureBasis,
  Industry,
  LineOfBusiness,
  LostReason,
  Province,
  RenewalStatus,
  ClaimStatus,
  ParticipantRole,
  SubmissionStatus,
  DeclineReason,
} from "@/lib/constants";
import type { LayerType, LineGroup, RequirementCoverage } from "@/lib/domain/program";
import { LOST_REASON_LABELS } from "@/lib/constants";

export interface DemoContact {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

export interface DemoChecklistItem {
  label: string;
  source: "common" | "line" | "custom";
  done: boolean;
}

export interface DemoTask {
  title: string;
  dueDate: ISODate;
  owner: string | null;
  done: boolean;
}

export type DemoOutcome =
  | { type: "renewed"; successorKey: string; recordedAsOf: ISODate }
  | { type: "lost"; lostReason: LostReason; competingPremium: number | null; recordedAsOf: ISODate }
  | { type: "non_renewed"; reason: string; recordedAsOf: ISODate };

export interface DemoQuote {
  /** Stable key so a retention option can point at this quote; null for most quotes. */
  key: string | null;
  premium: number;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  endorsements: Endorsement[];
  commissionRate: number;
  exposureAmount: number | null;
  subjectivities: string | null;
  /** Days from the as-of date. */
  validUntilOffset: number;
  incumbent: boolean;
  bound: boolean;
}

/** v1.2: a retention option on a policy in renewal. */
export interface DemoRetentionOption {
  label: string;
  carrier: string;
  deductible: number;
  aggregateCap: number | null;
  premium: number;
  /** Key of the DemoQuote this option was imported from, if any. */
  sourceQuoteKey: string | null;
}

export interface DemoSubmission {
  carrier: string;
  /** Days from the as-of date (negative = past). */
  sentOffset: number | null;
  respondedOffset: number | null;
  status: SubmissionStatus;
  declineReason: DeclineReason | null;
  notes: string | null;
  quotes: DemoQuote[];
}

export interface DemoParticipant {
  carrier: string;
  role: ParticipantRole;
  signedLine: number;
  premium: number | null;
}

export interface DemoSublimit {
  name: string;
  limit: number | null;
  deductible: number | null;
}

export interface DemoTowerLayer {
  lineGroup: LineGroup;
  layerType: LayerType;
  attachment: number;
  limit: number;
  premium: number;
  carrier: string;
  /** Key of the linked policy, if any. */
  policyKey: string | null;
}

export interface DemoRequirement {
  contractName: string;
  counterparty: string;
  coverage: RequirementCoverage;
  requiredOccurrence: number | null;
  requiredAggregate: number | null;
  requiredEndorsements: Endorsement[];
  notes: string | null;
}

export interface DemoCertificate {
  holder: string;
  operationsDescription: string | null;
  coverages: LineOfBusiness[];
  /** Days from the as-of date (negative = past). */
  requiredByOffset: number | null;
  issuedOnOffset: number | null;
}

export interface DemoClaim {
  claimNumber: string;
  lineOfBusiness: LineOfBusiness;
  /** Key of the policy whose term contains the date of loss. */
  policyKey: string;
  dateOfLoss: ISODate;
  dateReported: ISODate;
  description: string;
  paid: number;
  reserved: number;
  status: ClaimStatus;
}

export interface DemoActivity {
  kind: "note" | "outcome_recorded" | "checklist_complete";
  body: string;
  policyKey: string | null;
  asOfDate: ISODate;
}

export interface DemoPolicy {
  /** Stable key used to link policies (predecessor/successor), tasks and activities. */
  key: string;
  /** Key of the policy this one renewed, if any. */
  previousKey: string | null;
  /** A historical term (prior-year or lost before this year) kept for history; excluded from the v0.1 date-range rules. */
  priorTerm: boolean;
  /** Null means the checklist has not been opened yet (it is generated on first open). */
  checklist: DemoChecklistItem[] | null;
  /** v1: co-insurers on a larger placement, sub-limits, and the property adequacy inputs. */
  participants: DemoParticipant[];
  sublimits: DemoSublimit[];
  /** v1.1: carriers approached for this policy's renewal, with their quotes. */
  submissions: DemoSubmission[];
  /** v1.2: retention options for the Strategy tab. */
  retentionOptions: DemoRetentionOption[];
  insurableValue: number | null;
  coinsurancePercent: number | null;
  tasks: DemoTask[];
  outcome: DemoOutcome | null;
  carrier: string;
  lineOfBusiness: LineOfBusiness;
  policyNumber: string;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  /** Days from the as-of date to expiry; kept for tests and explanations. */
  expiryOffsetDays: number;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  annualPremium: number;
  commissionRate: number;
  exposureBasis: ExposureBasis;
  exposureAmount: number | null;
  endorsements: Endorsement[];
  renewalStatus: RenewalStatus;
  notes: string | null;
}

export interface DemoAccount {
  name: string;
  industry: Industry;
  annualRevenue: number | null;
  employeeCount: number | null;
  province: Province;
  producer: string | null;
  accountManager: string | null;
  status: AccountStatus;
  notes: string | null;
  /** v1.2 total cost of risk inputs (annual, dollars). */
  brokerFees: number;
  riskControlSpend: number;
  claimsAdminCost: number;
  contacts: DemoContact[];
  policies: DemoPolicy[];
  /** Tasks on the account that are not tied to a policy. */
  accountTasks: DemoTask[];
  activities: DemoActivity[];
  claims: DemoClaim[];
  towerLayers: DemoTowerLayer[];
  requirements: DemoRequirement[];
  certificates: DemoCertificate[];
}

export const DEMO_WORKSPACE_NAME = "Demo brokerage";

// Fictional carriers and people.
const C = {
  northgate: "Northgate Mutual",
  dominion: "Dominion Shield Insurance",
  aurora: "Aurora Commercial Underwriters",
  plains: "Great Plains Assurance",
  maritime: "Maritime Standard Insurance",
  lakeshore: "Lakeshore Specialty",
  boreal: "Boreal Casualty Company",
  tamarack: "Tamarack Insurance Company",
} as const;

const PRODUCERS = ["Dana Whitfield", "Marcus Oyelaran", "Priya Raghunathan"] as const;
const MANAGERS = ["Jordan Teague", "Elise Marchetti"] as const;

const LINE_CODE: Record<LineOfBusiness, string> = {
  "General Liability": "GL",
  Property: "PR",
  "Commercial Auto": "CA",
  "Umbrella/Excess": "UM",
  "Workers Compensation": "WC",
  "Professional Liability": "PL",
  Cyber: "CY",
  "Equipment Breakdown": "EB",
};

const CARRIER_CODE: Record<string, string> = {
  [C.northgate]: "NGM",
  [C.dominion]: "DSI",
  [C.aurora]: "ACU",
  [C.plains]: "GPA",
  [C.maritime]: "MSI",
  [C.lakeshore]: "LSS",
  [C.boreal]: "BCC",
  [C.tamarack]: "TIC",
};

interface PolicySpec {
  line: LineOfBusiness;
  carrier: string;
  /** Days from as-of to expiry. */
  expires: number;
  premium: number;
  commission: number;
  occ?: number | null;
  agg?: number | null;
  ded?: number | null;
  basis: ExposureBasis;
  exposure?: number | null;
  endorsements?: Endorsement[];
  status?: RenewalStatus;
  notes?: string;
  key?: string;
  previousKey?: string;
  priorTerm?: boolean;
  /** Override the default 365-day term ending `expires` days after as-of. */
  term?: { effectiveDate: ISODate; expiryDate: ISODate };
  /** Adds the four standard renewal tasks; titles listed here are marked done. */
  standardTasksDone?: string[];
  outcome?: DemoOutcome;
  /** Every checklist item ticked (Ready to market). */
  checklistComplete?: boolean;
  participants?: DemoParticipant[];
  sublimits?: DemoSublimit[];
  submissions?: DemoSubmission[];
  retentionOptions?: DemoRetentionOption[];
  insurableValue?: number;
  coinsurancePercent?: number;
}

let policySeq = 0;

function policy(asOf: ISODate, owner: string | null, spec: PolicySpec): DemoPolicy {
  policySeq += 1;
  const expiryDate = spec.term?.expiryDate ?? addDays(asOf, spec.expires).value;
  const effectiveDate = spec.term?.effectiveDate ?? addDays(expiryDate, -365).value;
  const seq = String(1000 + policySeq);
  const tasks: DemoTask[] = spec.standardTasksDone
    ? STANDARD_RENEWAL_TASKS.map((t) => ({
        title: t.title,
        dueDate: addDays(expiryDate, -t.daysBeforeExpiry).value,
        owner,
        done: spec.standardTasksDone!.includes(t.title),
      }))
    : [];
  const checklist = spec.checklistComplete
    ? checklistTemplate(spec.line).value.map((i) => ({ label: i.label, source: i.source, done: true }))
    : null;
  return {
    key: spec.key ?? `p${seq}`,
    previousKey: spec.previousKey ?? null,
    priorTerm: spec.priorTerm ?? false,
    checklist,
    tasks,
    outcome: spec.outcome ?? null,
    participants: spec.participants ?? [],
    sublimits: spec.sublimits ?? [],
    submissions: spec.submissions ?? [],
    retentionOptions: spec.retentionOptions ?? [],
    insurableValue: spec.insurableValue ?? null,
    coinsurancePercent: spec.coinsurancePercent ?? null,
    carrier: spec.carrier,
    lineOfBusiness: spec.line,
    policyNumber: `${CARRIER_CODE[spec.carrier]}-${LINE_CODE[spec.line]}-${seq}`,
    effectiveDate,
    expiryDate,
    expiryOffsetDays: daysBetween(asOf, expiryDate).value,
    occurrenceLimit: spec.occ ?? null,
    aggregateLimit: spec.agg ?? null,
    deductible: spec.ded ?? null,
    annualPremium: spec.premium,
    commissionRate: spec.commission,
    exposureBasis: spec.basis,
    exposureAmount: spec.exposure ?? null,
    endorsements: spec.endorsements ?? [],
    renewalStatus: spec.status ?? (spec.expires <= 90 ? "in_progress" : "not_started"),
    notes: spec.notes ?? null,
  };
}

const M = 1_000_000;
const K = 1_000;

type AccountSpec = Omit<DemoAccount, "policies" | "accountTasks" | "activities" | "claims" | "towerLayers" | "requirements" | "certificates" | "brokerFees" | "riskControlSpend" | "claimsAdminCost"> & {
  policies: PolicySpec[];
  brokerFees?: number;
  riskControlSpend?: number;
  claimsAdminCost?: number;
  accountTasks?: DemoTask[];
  noteLog?: string[];
  claims?: DemoClaim[];
  towerLayers?: DemoTowerLayer[];
  requirements?: DemoRequirement[];
  certificates?: DemoCertificate[];
};

interface ClaimSpec {
  /** Index into the account's policy-year effective dates (0 = PY2022 with the default as-of date). */
  year: number;
  number: string;
  /** Days after that policy year's effective date. */
  lossDay: number;
  /** Days from loss to report. */
  lag: number;
  description: string;
  paid: number;
  reserved: number;
  status: ClaimStatus;
}

/** Builds claims dated relative to each policy year, so they always fall inside the right term. */
function claimsFor(line: LineOfBusiness, yearKeys: string[], effectiveDates: ISODate[], specs: ClaimSpec[]): DemoClaim[] {
  return specs.map((c) => {
    const dateOfLoss = addDays(effectiveDates[c.year], c.lossDay).value;
    return {
      claimNumber: c.number,
      lineOfBusiness: line,
      policyKey: yearKeys[c.year],
      dateOfLoss,
      dateReported: addDays(dateOfLoss, c.lag).value,
      description: c.description,
      paid: c.paid,
      reserved: c.reserved,
      status: c.status,
    };
  });
}

export function buildDemoBook(asOf: ISODate): DemoAccount[] {
  policySeq = 0;
  const d = (days: number) => addDays(asOf, days).value;
  const p = (spec: PolicySpec) => spec;
  const stdGl: Endorsement[] = ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"];

  // Cedar Ridge's current GL ends 120 days out; its prior-year term ended when the current one began.
  const cedarCurrentEffective = addDays(d(120), -365).value;
  // Five GL policy years for the two loss-run accounts. The current terms are the
  // ones already in the book; earlier years step back 12 months at a time.
  // With the default as-of (2026-11-12) these are PY2022 to PY2026.
  const harbourCurrentEffective = addDays(d(60), -365).value;
  const harbourEff = [4, 3, 2, 1, 0].map((k) => addMonths(harbourCurrentEffective, -12 * k).value);
  const harbourKeys = ["harbour-gl-2022", "harbour-gl-2023", "harbour-gl-2024", "harbour-gl-2025", "harbour-gl"];
  const cedarPriorEffective = addDays(cedarCurrentEffective, -365).value;
  const cedarEff = [...[3, 2, 1].map((k) => addMonths(cedarPriorEffective, -12 * k).value), cedarPriorEffective, cedarCurrentEffective];
  const cedarKeys = ["cedar-gl-2022", "cedar-gl-2023", "cedar-gl-2024", "cedar-gl-prior", "cedar-gl"];
  const termOf = (eff: ISODate[], i: number) => ({ effectiveDate: eff[i], expiryDate: eff[i + 1] });
  const histGl = (keys: string[], eff: ISODate[], i: number, carrier: string, premium: number, commission: number, exposure: number, ded: number, endorsements: Endorsement[]): PolicySpec => ({
    key: keys[i],
    previousKey: i > 0 ? keys[i - 1] : undefined,
    priorTerm: true,
    line: "General Liability",
    carrier,
    expires: daysBetween(asOf, eff[i + 1]).value,
    term: termOf(eff, i),
    premium,
    commission,
    occ: 1 * M,
    agg: 2 * M,
    ded,
    basis: "revenue",
    exposure,
    endorsements,
    status: "renewed",
    outcome: { type: "renewed", successorKey: keys[i + 1], recordedAsOf: addDays(eff[i + 1], -14).value },
  });
  // A prior-year term ends the day its current successor began (current expiry − 365 days).
  const priorOf = (currentExpires: number) => daysBetween(asOf, addDays(d(currentExpires), -365).value).value;
  // Maple & Mast's two policies expire on the as-of date and were renewed: successors run 12 months from today.
  const mapleRenewal = planSuccessorTerm(asOf).value;
  // Northfield's GL expired 30 days ago and was renewed: successor runs 12 months from that expiry.
  const northfieldRenewal = planSuccessorTerm(d(-30)).value;

  // ---- v1.1 marketing: carriers approached and quotes (all carriers fictional) ----
  const stdGlEnd: Endorsement[] = ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"];
  const q = (over: Partial<DemoQuote> & Pick<DemoQuote, "premium">): DemoQuote => ({
    key: null,
    occurrenceLimit: 1 * M,
    aggregateLimit: 2 * M,
    deductible: 10_000,
    endorsements: stdGlEnd,
    commissionRate: 12.5,
    exposureAmount: null,
    subjectivities: null,
    validUntilOffset: 30,
    incumbent: false,
    bound: false,
    ...over,
  });
  const sub = (over: Partial<DemoSubmission> & Pick<DemoSubmission, "carrier" | "status">): DemoSubmission => ({
    sentOffset: -28,
    respondedOffset: null,
    declineReason: null,
    notes: null,
    quotes: [],
    ...over,
  });
  // Harbourline GL renewal (expiring $150,000, $10,000 deductible): the hand-verification case.
  const harbourMarketing: DemoSubmission[] = [
    sub({ carrier: C.dominion, status: "quoted", sentOffset: -30, respondedOffset: -12, notes: "Incumbent renewal.", quotes: [q({ premium: 158_000, exposureAmount: 26 * M, incumbent: true, validUntilOffset: 40, subjectivities: "Updated revenue figures; signed renewal application." })] }),
    sub({ carrier: "Pacific Crest Insurance (fictional)", status: "quoted", respondedOffset: -10, quotes: [q({ key: "harbour-pacific-crest", premium: 142_000, commissionRate: 15, exposureAmount: 26 * M, validUntilOffset: 35, subjectivities: "Signed application within 30 days of binding." })] }),
    sub({ carrier: "Ironwood Specialty (fictional)", status: "quoted", respondedOffset: -8, quotes: [q({ premium: 128_000, deductible: 25_000, endorsements: ["additional_insured", "primary_noncontributory"], commissionRate: 10, exposureAmount: 26 * M, subjectivities: "Satisfactory loss control survey of both plants; no waiver of subrogation available." })] }),
    sub({ carrier: "Maplewood Underwriters (fictional)", status: "declined", respondedOffset: -20, declineReason: "class_of_business", notes: "Does not write seafood processing." }),
    sub({ carrier: "Tidewater Assurance (fictional)", status: "submitted", sentOffset: -14, notes: "Chased once by phone." }),
  ];
  // Earlier renewals, so the market log has a year of history.
  const kestrelMarketing: DemoSubmission[] = [
    sub({ carrier: C.aurora, status: "bound", sentOffset: -320, respondedOffset: -300, quotes: [q({ premium: 420_000, occurrenceLimit: 48 * M, aggregateLimit: null, deductible: 50_000, endorsements: [], commissionRate: 10, incumbent: true, bound: true, validUntilOffset: -270 })] }),
    sub({ carrier: C.dominion, status: "quoted", sentOffset: -320, respondedOffset: -296, quotes: [q({ premium: 445_000, occurrenceLimit: 48 * M, aggregateLimit: null, deductible: 50_000, endorsements: [], commissionRate: 10, validUntilOffset: -270 })] }),
    sub({ carrier: "Maplewood Underwriters (fictional)", status: "declined", sentOffset: -320, respondedOffset: -310, declineReason: "capacity" }),
  ];
  const cedarMarketing: DemoSubmission[] = [
    sub({ carrier: C.northgate, status: "bound", sentOffset: -290, respondedOffset: -270, quotes: [q({ premium: 108_000, deductible: 5_000, endorsements: ["additional_insured"], commissionRate: 15, exposureAmount: 23 * M, incumbent: true, bound: true, validUntilOffset: -240 })] }),
    sub({ carrier: "Ironwood Specialty (fictional)", status: "quoted", sentOffset: -290, respondedOffset: -268, quotes: [q({ premium: 99_500, deductible: 25_000, endorsements: ["additional_insured"], commissionRate: 10, exposureAmount: 23 * M, validUntilOffset: -240 })] }),
    sub({ carrier: "Maplewood Underwriters (fictional)", status: "no_response", sentOffset: -290 }),
  ];
  const northfieldMarketing: DemoSubmission[] = [
    sub({ carrier: C.plains, status: "declined", sentOffset: -95, respondedOffset: -75, declineReason: "appetite", notes: "Withdrawing from plastics manufacturing." }),
    sub({ carrier: "Maplewood Underwriters (fictional)", status: "declined", sentOffset: -95, respondedOffset: -80, declineReason: "loss_history" }),
  ];

  // ---- v1.2 strategy: retention options (the $10,000 Pacific Crest option is the quote above) ----
  const pacificCrest = "Pacific Crest Insurance (fictional)";
  const harbourOptions: DemoRetentionOption[] = [
    { label: "$10,000 deductible", carrier: pacificCrest, deductible: 10_000, aggregateCap: null, premium: 142_000, sourceQuoteKey: "harbour-pacific-crest" },
    { label: "$25,000 deductible", carrier: pacificCrest, deductible: 25_000, aggregateCap: null, premium: 124_000, sourceQuoteKey: null },
    { label: "$50,000 deductible", carrier: pacificCrest, deductible: 50_000, aggregateCap: null, premium: 110_000, sourceQuoteKey: null },
  ];
  // Cedar Ridge: low frequency with one open loss, so the replay contrasts with Harbourline.
  const cedarOptions: DemoRetentionOption[] = [
    { label: "$5,000 deductible", carrier: C.northgate, deductible: 5_000, aggregateCap: null, premium: 108_000, sourceQuoteKey: null },
    { label: "$10,000 deductible", carrier: C.northgate, deductible: 10_000, aggregateCap: null, premium: 103_500, sourceQuoteKey: null },
    { label: "$25,000 deductible", carrier: C.northgate, deductible: 25_000, aggregateCap: null, premium: 97_000, sourceQuoteKey: null },
  ];

  const specs: AccountSpec[] = [
    // ---------- Construction ----------
    {
      name: "Cedar Ridge Mechanical Ltd.",
      industry: "construction",
      annualRevenue: 23 * M,
      employeeCount: 140,
      province: "BC",
      producer: PRODUCERS[0],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Mechanical contractor: HVAC, plumbing and process piping for commercial and institutional builds across the Lower Mainland.",
      noteLog: ["Owen asked whether a higher umbrella limit is needed for the new hospital project. Discuss at the strategy meeting."],
      towerLayers: [
        { lineGroup: "gl", layerType: "primary", attachment: 0, limit: 1 * M, premium: 108_000, carrier: C.northgate, policyKey: "cedar-gl" },
        // Attaches at $2M over a $1M primary: a $1M gap the program should close.
        { lineGroup: "gl", layerType: "umbrella", attachment: 2 * M, limit: 5 * M, premium: 27_800, carrier: C.boreal, policyKey: "cedar-um" },
      ],
      requirements: [
        { contractName: "Mechanical subcontract — Northgate Hospital expansion (fictional)", counterparty: "Harrow & Finch Construction Ltd. (fictional)", coverage: "Umbrella/Excess", requiredOccurrence: 5 * M, requiredAggregate: null, requiredEndorsements: [], notes: "General contractor requires a $5M umbrella above primary liability." },
        { contractName: "Mechanical subcontract — Northgate Hospital expansion (fictional)", counterparty: "Harrow & Finch Construction Ltd. (fictional)", coverage: "General Liability", requiredOccurrence: 1 * M, requiredAggregate: 2 * M, requiredEndorsements: ["additional_insured"], notes: null },
      ],
      certificates: [{ holder: "Harrow & Finch Construction Ltd. (fictional)", operationsDescription: "HVAC and plumbing installation, Northgate Hospital expansion, Burnaby.", coverages: ["General Liability", "Umbrella/Excess"], requiredByOffset: -40, issuedOnOffset: -35 }],
      claims: claimsFor("General Liability", cedarKeys, cedarEff, [
        { year: 0, number: "NGM-GL-22-0715", lossDay: 157, lag: 11, description: "Failed pipe fitting flooded a client's tenant space after a mechanical retrofit.", paid: 11_000, reserved: 0, status: "closed" },
        { year: 2, number: "NGM-GL-24-0288", lossDay: 58, lag: 6, description: "Unsecured ladder slid off a service van roof onto a client's parked car.", paid: 4_200, reserved: 0, status: "closed" },
        { year: 3, number: "NGM-GL-25-0841", lossDay: 201, lag: 14, description: "Building occupant scalded by a mis-set mixing valve installed by a Cedar Ridge crew.", paid: 5_000, reserved: 40_000, status: "open" },
      ]),
      contacts: [
        { name: "Owen Castellanos", role: "CFO", email: "owen.castellanos@cedarridgemech.example", phone: "604-555-0142" },
        { name: "Mei-Lin Harper", role: "Office Manager", email: "mharper@cedarridgemech.example", phone: "604-555-0188" },
      ],
      policies: [
        p(histGl(cedarKeys, cedarEff, 0, C.northgate, 82_000, 15, 15 * M, 5_000, ["additional_insured"])),
        p(histGl(cedarKeys, cedarEff, 1, C.northgate, 88_000, 15, 17 * M, 5_000, ["additional_insured"])),
        p(histGl(cedarKeys, cedarEff, 2, C.northgate, 94_000, 15, 18_500_000, 5_000, ["additional_insured"])),
        p({ key: "cedar-gl-prior", submissions: cedarMarketing, previousKey: "cedar-gl-2024", priorTerm: true, line: "General Liability", carrier: C.northgate, expires: daysBetween(asOf, cedarCurrentEffective).value, premium: 100_000, commission: 15, occ: 1 * M, agg: 2 * M, ded: 5_000, basis: "revenue", exposure: 20 * M, endorsements: ["additional_insured"], status: "renewed", outcome: { type: "renewed", successorKey: "cedar-gl", recordedAsOf: addDays(cedarCurrentEffective, -14).value }, notes: "Prior-year term: $100,000 on $20,000,000 revenue." }),
        p({ key: "cedar-gl", previousKey: "cedar-gl-prior", retentionOptions: cedarOptions, line: "General Liability", carrier: C.northgate, expires: 120, premium: 108_000, commission: 15, occ: 1 * M, agg: 2 * M, ded: 5_000, basis: "revenue", exposure: 23 * M, endorsements: ["additional_insured"], notes: "Expires exactly 120 days after the as-of date. Renewed from the prior year: premium up 8% on 15% more revenue." }),
        p({ key: "cedar-pr", line: "Property", carrier: C.northgate, expires: 120, premium: 42_500, commission: 15, occ: 600_000, agg: null, ded: 5_000, basis: "square_feet", exposure: 38_000, insurableValue: 1_000_000, coinsurancePercent: 80, sublimits: [{ name: "Building", limit: 600_000, deductible: 5_000 }, { name: "Contractor's equipment", limit: 250_000, deductible: 2_500 }, { name: "Sewer backup", limit: 50_000, deductible: 5_000 }], notes: "Shop and office building insured for $600,000 against a $1,000,000 insurable value, 80% coinsurance." }),
        p({ line: "Commercial Auto", carrier: C.dominion, expires: 120, premium: 61_200, commission: 12.5, occ: 2 * M, agg: null, ded: 2_500, basis: "vehicles", exposure: 34 }),
        p({ key: "cedar-um", line: "Umbrella/Excess", carrier: C.boreal, expires: 120, premium: 27_800, commission: 12, occ: 5 * M, agg: 5 * M, ded: null, basis: "revenue", exposure: 23 * M, endorsements: ["additional_insured"] }),
        p({ line: "Equipment Breakdown", carrier: C.tamarack, expires: 150, premium: 9_400, commission: 17.5, occ: 500 * K, agg: 500 * K, ded: 2_500, basis: "other", exposure: null }),
      ],
    },
    {
      name: "Bluewater Civil Contractors Inc.",
      industry: "construction",
      annualRevenue: 41 * M,
      employeeCount: 230,
      province: "ON",
      producer: PRODUCERS[1],
      accountManager: MANAGERS[1],
      status: "active",
      notes: "Roads, bridges and municipal water works.",
      contacts: [{ name: "Grace Abernathy", role: "Risk Manager", email: "g.abernathy@bluewatercivil.example", phone: "905-555-0117" }],
      policies: [
        p({ line: "General Liability", carrier: C.dominion, expires: 121, premium: 186_000, commission: 15, occ: 2 * M, agg: 4 * M, ded: 25_000, basis: "revenue", exposure: 41 * M, endorsements: stdGl, notes: "Expires exactly 121 days after the as-of date." }),
        p({ line: "Umbrella/Excess", carrier: C.boreal, expires: 121, premium: 74_000, commission: 12, occ: 10 * M, agg: 10 * M, ded: null, basis: "revenue", exposure: 41 * M }),
        p({ line: "Commercial Auto", carrier: C.dominion, expires: 121, premium: 92_300, commission: 12.5, occ: 2 * M, agg: null, ded: 5_000, basis: "vehicles", exposure: 58 }),
        p({ line: "Workers Compensation", carrier: C.plains, expires: 200, premium: 31_000, commission: 10, occ: null, agg: null, ded: null, basis: "payroll", exposure: 14_200_000 }),
      ],
    },
    {
      name: "Pinecrest Roofing & Cladding Ltd.",
      industry: "construction",
      annualRevenue: 7_800_000,
      employeeCount: 48,
      province: "AB",
      producer: PRODUCERS[2],
      accountManager: MANAGERS[0],
      status: "active",
      notes: null,
      contacts: [{ name: "Tobias Reinholt", role: "Owner", email: "tobias@pinecrestroofing.example", phone: "403-555-0199" }],
      policies: [
        p({ standardTasksDone: ["Strategy meeting", "Submit to market"], line: "General Liability", carrier: C.plains, expires: 30, premium: 54_600, commission: 15, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 7_800_000, endorsements: ["additional_insured", "waiver_of_subrogation"], notes: "Expires exactly 30 days after the as-of date." }),
        p({ line: "Commercial Auto", carrier: C.plains, expires: 30, premium: 18_900, commission: 12.5, occ: 2 * M, agg: null, ded: 1_000, basis: "vehicles", exposure: 11 }),
        p({ line: "Equipment Breakdown", carrier: C.tamarack, expires: 260, premium: 6_000, commission: 17.5, occ: 250 * K, agg: 250 * K, ded: 1_000, basis: "other" }),
      ],
    },

    // ---------- Manufacturing ----------
    {
      name: "Harbourline Foods Inc.",
      industry: "manufacturing",
      annualRevenue: 25 * M,
      employeeCount: 210,
      province: "ON",
      producer: PRODUCERS[0],
      accountManager: MANAGERS[1],
      status: "active",
      notes: "Frozen seafood processor with two plants (Hamilton and Port Halverston), supplying private-label product to grocery chains; plant tours for buyers and suppliers.",
      brokerFees: 15_000,
      riskControlSpend: 10_000,
      noteLog: ["Plant expansion in the first quarter will add roughly 20% to payroll. Update exposure figures before marketing."],
      towerLayers: [
        { lineGroup: "gl", layerType: "primary", attachment: 0, limit: 1 * M, premium: 150_000, carrier: C.dominion, policyKey: "harbour-gl" },
        { lineGroup: "gl", layerType: "umbrella", attachment: 1 * M, limit: 5 * M, premium: 22_000, carrier: C.boreal, policyKey: null },
        { lineGroup: "gl", layerType: "excess", attachment: 6 * M, limit: 10 * M, premium: 18_000, carrier: C.aurora, policyKey: null },
      ],
      requirements: [
        { contractName: "Supply agreement — Westbay Grocers (fictional)", counterparty: "Westbay Grocers Ltd. (fictional)", coverage: "General Liability", requiredOccurrence: 2 * M, requiredAggregate: 4 * M, requiredEndorsements: ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"], notes: "Private-label frozen seafood supply, five-year term." },
        { contractName: "Supply agreement — Westbay Grocers (fictional)", counterparty: "Westbay Grocers Ltd. (fictional)", coverage: "Umbrella/Excess", requiredOccurrence: 5 * M, requiredAggregate: null, requiredEndorsements: [], notes: null },
        { contractName: "Supply agreement — Westbay Grocers (fictional)", counterparty: "Westbay Grocers Ltd. (fictional)", coverage: "Commercial Auto", requiredOccurrence: 1 * M, requiredAggregate: null, requiredEndorsements: ["additional_insured"], notes: "$1,000,000 combined single limit." },
        { contractName: "Supply agreement — Westbay Grocers (fictional)", counterparty: "Westbay Grocers Ltd. (fictional)", coverage: "Workers Compensation", requiredOccurrence: null, requiredAggregate: null, requiredEndorsements: ["waiver_of_subrogation"], notes: "Statutory limits." },
      ],
      certificates: [
        // Rests on the Commercial Auto policy, which runs 95 more days: issued.
        { holder: "Westbay Grocers Ltd. (fictional)", operationsDescription: "Deliveries to Westbay distribution centres under the supply agreement.", coverages: ["Commercial Auto"], requiredByOffset: -50, issuedOnOffset: -45 },
        // Rests on the GL policy expiring in 60 days: issued now, reissue needed once the GL renewal is recorded.
        { holder: "Port of Halverston Authority (fictional)", operationsDescription: "Cold-storage lease, Pier 4 processing plant.", coverages: ["General Liability"], requiredByOffset: -20, issuedOnOffset: -18 },
      ],
      claims: claimsFor("General Liability", harbourKeys, harbourEff, [
        { year: 0, number: "DSI-GL-22-0147", lossDay: 62, lag: 7, description: "Visitor slipped on a wet floor in the packing hall during a supplier plant tour.", paid: 8_000, reserved: 0, status: "closed" },
        { year: 0, number: "DSI-GL-22-0311", lossDay: 178, lag: 10, description: "Product contamination recall: distributor's recall costs and customer illness complaints from one smoked-fish batch.", paid: 32_000, reserved: 0, status: "closed" },
        { year: 0, number: "DSI-GL-22-0498", lossDay: 295, lag: 3, description: "Reversing forklift made contact with a visitor's parked vehicle in the yard.", paid: 4_500, reserved: 0, status: "closed" },
        { year: 1, number: "DSI-GL-23-0102", lossDay: 98, lag: 5, description: "Delivery driver tripped over a wash-down hose at the loading bay.", paid: 15_000, reserved: 0, status: "closed" },
        { year: 1, number: "DSI-GL-23-0388", lossDay: 228, lag: 12, description: "Cold-chain failure led to a retailer recall; third-party recall costs and consumer illness claims.", paid: 30_000, reserved: 90_000, status: "open" },
        { year: 2, number: "DSI-GL-24-0056", lossDay: 26, lag: 4, description: "Customer pallets crushed by a forklift during a third-party pickup.", paid: 2_000, reserved: 0, status: "closed" },
        { year: 2, number: "DSI-GL-24-0219", lossDay: 159, lag: 9, description: "Undeclared allergen on a private-label batch; consumer reaction claim.", paid: 6_500, reserved: 0, status: "closed" },
        { year: 2, number: "DSI-GL-24-0402", lossDay: 266, lag: 6, description: "Refrigeration contractor fell from the loading-dock edge.", paid: 27_000, reserved: 0, status: "closed" },
        { year: 3, number: "DSI-GL-25-0233", lossDay: 131, lag: 8, description: "Metal fragment found in a frozen product; consumer dental injury.", paid: 12_000, reserved: 48_000, status: "open" },
        { year: 4, number: "DSI-GL-26-0061", lossDay: 34, lag: 2, description: "Visitor slipped on ice in the plant's visitor parking lot.", paid: 9_000, reserved: 0, status: "closed" },
        { year: 4, number: "DSI-GL-26-0184", lossDay: 170, lag: 3, description: "Yard truck struck a courier's van at the shipping gate.", paid: 18_000, reserved: 0, status: "closed" },
        { year: 4, number: "DSI-GL-26-0297", lossDay: 241, lag: 5, description: "Leaking brine pallet damaged a customer's warehouse flooring.", paid: 3_000, reserved: 0, status: "closed" },
      ]),
      contacts: [
        { name: "Rosalind Achebe", role: "VP Finance", email: "rachebe@harbourlinefoods.example", phone: "416-555-0163" },
        { name: "Felix Dufresne", role: "Plant Manager", email: "fdufresne@harbourlinefoods.example", phone: "416-555-0171" },
      ],
      policies: [
        p(histGl(harbourKeys, harbourEff, 0, C.dominion, 135_000, 12.5, 25 * M, 10_000, stdGl)),
        p(histGl(harbourKeys, harbourEff, 1, C.dominion, 140_000, 12.5, 25 * M, 10_000, stdGl)),
        p(histGl(harbourKeys, harbourEff, 2, C.dominion, 145_000, 12.5, 25 * M, 10_000, stdGl)),
        p(histGl(harbourKeys, harbourEff, 3, C.dominion, 148_000, 12.5, 25 * M, 10_000, stdGl)),
        p({ key: "harbour-gl", previousKey: "harbour-gl-2025", submissions: harbourMarketing, retentionOptions: harbourOptions, standardTasksDone: ["Strategy meeting"], line: "General Liability", carrier: C.dominion, expires: 60, premium: 150_000, commission: 12.5, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 25 * M, endorsements: stdGl, notes: "Expires exactly 60 days after the as-of date." }),
        p({ line: "Property", carrier: C.dominion, expires: 60, premium: 212_000, commission: 12.5, occ: null, agg: null, ded: 25_000, basis: "square_feet", exposure: 96_000 }),
        p({ line: "Equipment Breakdown", carrier: C.tamarack, expires: 60, premium: 24_800, commission: 15, occ: 5 * M, agg: 5 * M, ded: 10_000, basis: "other" }),
        p({ line: "Commercial Auto", carrier: C.northgate, expires: 95, premium: 33_400, commission: 12.5, occ: 2 * M, agg: null, ded: 2_500, basis: "vehicles", exposure: 19 }),
        p({ line: "Cyber", carrier: C.lakeshore, expires: 310, premium: 17_600, commission: 17.5, occ: 1 * M, agg: 1 * M, ded: 10_000, basis: "revenue", exposure: 25 * M }),
      ],
    },
    {
      name: "Kestrel Precision Components Corp.",
      industry: "manufacturing",
      annualRevenue: 58 * M,
      employeeCount: 390,
      province: "QC",
      producer: PRODUCERS[1],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Aerospace machining; ITAR-adjacent contracts.",
      contacts: [{ name: "Noor Haddad", role: "Controller", email: "nhaddad@kestrelprecision.example", phone: "514-555-0126" }],
      policies: [
        p({ key: "kestrel-pr-prior", submissions: kestrelMarketing, priorTerm: true, line: "Property", carrier: C.aurora, expires: priorOf(90), premium: 360_000, commission: 10, occ: null, agg: null, ded: 50_000, basis: "square_feet", exposure: 205_000, status: "renewed", outcome: { type: "renewed", successorKey: "kestrel-pr", recordedAsOf: addDays(d(priorOf(90)), -10).value } }),
        p({ key: "kestrel-pr", previousKey: "kestrel-pr-prior", participants: [{ carrier: C.aurora, role: "lead", signedLine: 50, premium: 210_000 }, { carrier: C.dominion, role: "follow", signedLine: 30, premium: 126_000 }, { carrier: C.boreal, role: "follow", signedLine: 20, premium: 84_000 }], sublimits: [{ name: "Earthquake", limit: 5 * M, deductible: 250_000 }, { name: "Flood", limit: 2 * M, deductible: 50_000 }, { name: "Stock in process", limit: 1_500_000, deductible: 10_000 }, { name: "Business interruption", limit: 8 * M, deductible: null }], insurableValue: 48 * M, coinsurancePercent: 90, line: "Property", carrier: C.aurora, expires: 90, premium: 420_000, commission: 10, occ: null, agg: null, ded: 50_000, basis: "square_feet", exposure: 210_000, standardTasksDone: ["Strategy meeting"], checklistComplete: true, notes: "Expires exactly 90 days after the as-of date. Largest premium in the book." }),
        p({ line: "General Liability", carrier: C.aurora, expires: 90, premium: 134_000, commission: 12.5, occ: 2 * M, agg: 4 * M, ded: 25_000, basis: "revenue", exposure: 58 * M, endorsements: stdGl }),
        p({ line: "Umbrella/Excess", carrier: C.boreal, expires: 90, premium: 88_000, commission: 12, occ: 25 * M, agg: 25 * M, ded: null, basis: "revenue", exposure: 58 * M }),
        p({ line: "Equipment Breakdown", carrier: C.tamarack, expires: 90, premium: 46_000, commission: 15, occ: 10 * M, agg: 10 * M, ded: 25_000, basis: "other" }),
      ],
    },
    {
      name: "Northfield Plastics Ltd.",
      industry: "manufacturing",
      annualRevenue: 12_400_000,
      employeeCount: 85,
      province: "MB",
      producer: PRODUCERS[2],
      accountManager: MANAGERS[1],
      status: "active",
      notes: null,
      contacts: [{ name: "Ivan Petrosyan", role: "General Manager", email: "ipetrosyan@northfieldplastics.example", phone: "204-555-0154" }],
      policies: [
        p({ key: "northfield-gl", line: "General Liability", carrier: C.plains, expires: -30, premium: 71_500, commission: 15, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 12_400_000, endorsements: ["additional_insured"], status: "renewed", outcome: { type: "renewed", successorKey: "northfield-gl-renewal", recordedAsOf: d(-38) }, notes: "Expired 30 days before the as-of date; renewed with Great Plains." }),
        p({ key: "northfield-gl-renewal", previousKey: "northfield-gl", line: "General Liability", carrier: C.plains, expires: daysBetween(asOf, northfieldRenewal.expiryDate).value, term: northfieldRenewal, premium: 75_800, commission: 15, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 13_100_000, endorsements: ["additional_insured"], status: "not_started" }),
        p({ key: "northfield-pr", submissions: northfieldMarketing, line: "Property", carrier: C.plains, expires: -30, premium: 96_200, commission: 15, occ: null, agg: null, ded: 25_000, basis: "square_feet", exposure: 72_000, status: "non_renewed", outcome: { type: "non_renewed", reason: "Carrier withdrew from plastics manufacturing in Manitoba.", recordedAsOf: d(-75) }, notes: "Expired 30 days before the as-of date; non-renewed by the carrier." }),
        p({ line: "Commercial Auto", carrier: C.northgate, expires: 180, premium: 14_300, commission: 12.5, occ: 2 * M, agg: null, ded: 1_000, basis: "vehicles", exposure: 7 }),
      ],
    },

    // ---------- Hospitality ----------
    {
      name: "Maple & Mast Hospitality Group",
      industry: "hospitality",
      annualRevenue: 9_600_000,
      employeeCount: 160,
      province: "NS",
      producer: PRODUCERS[0],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Four waterfront restaurants and a boutique inn.",
      contacts: [{ name: "Camille Boudreau", role: "Owner", email: "camille@mapleandmast.example", phone: "902-555-0108" }],
      policies: [
        p({ key: "maple-gl", line: "General Liability", carrier: C.maritime, expires: 0, premium: 38_700, commission: 15, occ: 2 * M, agg: 4 * M, ded: 2_500, basis: "revenue", exposure: 9_600_000, endorsements: ["additional_insured", "notice_of_cancellation_30"], status: "renewed", outcome: { type: "renewed", successorKey: "maple-gl-renewal", recordedAsOf: d(-6) }, notes: "Expires on the as-of date (0 days); renewed." }),
        p({ key: "maple-gl-renewal", previousKey: "maple-gl", line: "General Liability", carrier: C.maritime, expires: daysBetween(asOf, mapleRenewal.expiryDate).value, term: mapleRenewal, premium: 41_200, commission: 15, occ: 2 * M, agg: 4 * M, ded: 2_500, basis: "revenue", exposure: 10_100_000, endorsements: ["additional_insured", "notice_of_cancellation_30"], status: "not_started" }),
        p({ key: "maple-pr", line: "Property", carrier: C.maritime, expires: 0, premium: 52_100, commission: 15, occ: null, agg: null, ded: 5_000, basis: "square_feet", exposure: 24_500, status: "renewed", outcome: { type: "renewed", successorKey: "maple-pr-renewal", recordedAsOf: d(-6) } }),
        p({ key: "maple-pr-renewal", previousKey: "maple-pr", line: "Property", carrier: C.maritime, expires: daysBetween(asOf, mapleRenewal.expiryDate).value, term: mapleRenewal, premium: 55_900, commission: 15, occ: null, agg: null, ded: 5_000, basis: "square_feet", exposure: 24_500, status: "not_started" }),
        p({ line: "Cyber", carrier: C.lakeshore, expires: 240, premium: 7_900, commission: 17.5, occ: 500 * K, agg: 500 * K, ded: 2_500, basis: "revenue", exposure: 9_600_000 }),
      ],
    },
    {
      name: "Lantern Hill Resorts Inc.",
      industry: "hospitality",
      annualRevenue: 31 * M,
      employeeCount: 420,
      province: "BC",
      producer: PRODUCERS[1],
      accountManager: MANAGERS[1],
      status: "active",
      notes: "Ski-and-lake resort; seasonal headcount peaks at 600.",
      contacts: [
        { name: "Hugo Lindqvist", role: "Director of Finance", email: "hlindqvist@lanternhill.example", phone: "250-555-0133" },
        { name: "Sadie Okonkwo", role: "Risk & Safety Lead", email: "sokonkwo@lanternhill.example", phone: "250-555-0139" },
      ],
      policies: [
        p({ line: "Property", carrier: C.northgate, expires: 400, premium: 310_000, commission: 10, occ: null, agg: null, ded: 50_000, basis: "square_feet", exposure: 180_000, notes: "Expires 400 days after the as-of date (latest in the book)." }),
        p({ line: "General Liability", carrier: C.northgate, expires: 400, premium: 122_000, commission: 12.5, occ: 5 * M, agg: 10 * M, ded: 10_000, basis: "revenue", exposure: 31 * M, endorsements: stdGl }),
        p({ line: "Umbrella/Excess", carrier: C.boreal, expires: 400, premium: 58_000, commission: 12, occ: 10 * M, agg: 10 * M, ded: null, basis: "revenue", exposure: 31 * M }),
        p({ line: "Commercial Auto", carrier: C.dominion, expires: 45, premium: 26_400, commission: 12.5, occ: 2 * M, agg: null, ded: 2_500, basis: "vehicles", exposure: 16, status: "lost", outcome: { type: "lost", lostReason: "price", competingPremium: 22_900, recordedAsOf: d(-3) } }),
      ],
    },

    // ---------- Professional services ----------
    {
      name: "Ashgrove Engineering Consultants Inc.",
      industry: "professional services",
      annualRevenue: 18_500_000,
      employeeCount: 95,
      province: "ON",
      producer: PRODUCERS[2],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Structural and geotechnical engineering.",
      contacts: [{ name: "Beatrix Nakamura", role: "Managing Partner", email: "bnakamura@ashgrove-eng.example", phone: "613-555-0147" }],
      policies: [
        p({ standardTasksDone: [], line: "Professional Liability", carrier: C.lakeshore, expires: 75, premium: 94_000, commission: 15, occ: 5 * M, agg: 10 * M, ded: 50_000, basis: "revenue", exposure: 18_500_000 }),
        p({ line: "General Liability", carrier: C.aurora, expires: 75, premium: 16_800, commission: 15, occ: 2 * M, agg: 4 * M, ded: 2_500, basis: "revenue", exposure: 18_500_000, endorsements: ["additional_insured"] }),
        p({ line: "Cyber", carrier: C.lakeshore, expires: 75, premium: 12_300, commission: 17.5, occ: 2 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 18_500_000 }),
      ],
    },
    {
      name: "Tidewater Accounting Partners LLP",
      industry: "professional services",
      annualRevenue: 6_200_000,
      employeeCount: 34,
      province: "NB",
      producer: PRODUCERS[0],
      accountManager: MANAGERS[1],
      status: "active",
      notes: null,
      contacts: [{ name: "Leonard Mbeki", role: "Partner", email: "lmbeki@tidewatercpa.example", phone: "506-555-0112" }],
      policies: [
        p({ key: "tidewater-pl-prior", priorTerm: true, line: "Professional Liability", carrier: C.maritime, expires: priorOf(330), premium: 21_200, commission: 15, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 5_100_000, status: "renewed", outcome: { type: "renewed", successorKey: "tidewater-pl", recordedAsOf: addDays(d(priorOf(330)), -9).value } }),
        p({ key: "tidewater-pl", previousKey: "tidewater-pl-prior", line: "Professional Liability", carrier: C.maritime, expires: 330, premium: 28_600, commission: 15, occ: 2 * M, agg: 4 * M, ded: 10_000, basis: "revenue", exposure: 6_200_000 }),
        p({ line: "Cyber", carrier: C.lakeshore, expires: 330, premium: 8_400, commission: 17.5, occ: 1 * M, agg: 1 * M, ded: 5_000, basis: "revenue", exposure: 6_200_000 }),
      ],
    },

    // ---------- Transportation ----------
    {
      name: "Greyhawk Freight Lines Ltd.",
      industry: "transportation",
      annualRevenue: 46 * M,
      employeeCount: 310,
      province: "AB",
      producer: PRODUCERS[1],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Cross-border LTL carrier, 140 power units.",
      contacts: [{ name: "Agnes Thorvaldsen", role: "Safety Director", email: "athorvaldsen@greyhawkfreight.example", phone: "780-555-0176" }],
      policies: [
        p({ key: "greyhawk-ca-prior", priorTerm: true, line: "Commercial Auto", carrier: C.dominion, expires: priorOf(15), premium: 293_500, commission: 10, occ: 5 * M, agg: null, ded: 10_000, basis: "vehicles", exposure: 120, status: "renewed", outcome: { type: "renewed", successorKey: "greyhawk-ca", recordedAsOf: addDays(d(priorOf(15)), -12).value } }),
        p({ key: "greyhawk-ca", previousKey: "greyhawk-ca-prior", standardTasksDone: ["Strategy meeting", "Submit to market"], line: "Commercial Auto", carrier: C.dominion, expires: 15, premium: 398_000, commission: 10, occ: 5 * M, agg: null, ded: 10_000, basis: "vehicles", exposure: 140, endorsements: ["additional_insured", "notice_of_cancellation_30"], status: "in_progress" }),
        p({ line: "General Liability", carrier: C.dominion, expires: 15, premium: 44_000, commission: 12.5, occ: 2 * M, agg: 4 * M, ded: 5_000, basis: "revenue", exposure: 46 * M, endorsements: stdGl, status: "in_progress" }),
        p({ line: "Umbrella/Excess", carrier: C.boreal, expires: 15, premium: 96_500, commission: 12, occ: 10 * M, agg: 10 * M, ded: null, basis: "vehicles", exposure: 140, status: "in_progress" }),
        p({ line: "Workers Compensation", carrier: C.plains, expires: 220, premium: 52_000, commission: 10, occ: null, agg: null, ded: null, basis: "payroll", exposure: 19_800_000 }),
      ],
    },
    {
      name: "Prairie Loop Logistics Inc.",
      industry: "transportation",
      annualRevenue: 11_300_000,
      employeeCount: 72,
      province: "SK",
      producer: PRODUCERS[2],
      accountManager: MANAGERS[1],
      status: "active",
      notes: null,
      contacts: [{ name: "Delphine Arsenault", role: "Operations Manager", email: "darsenault@prairieloop.example", phone: "306-555-0121" }],
      policies: [
        p({ key: "prairie-um-lost", priorTerm: true, line: "Umbrella/Excess", carrier: C.boreal, expires: -160, premium: 58_800, commission: 12, occ: 5 * M, agg: 5 * M, ded: null, basis: "vehicles", exposure: 46, status: "lost", outcome: { type: "lost", lostReason: "price", competingPremium: 49_500, recordedAsOf: d(-170) }, notes: "Moved to another broker's umbrella programme on price." }),
        p({ line: "Commercial Auto", carrier: C.plains, expires: 105, premium: 136_000, commission: 12.5, occ: 2 * M, agg: null, ded: 5_000, basis: "vehicles", exposure: 46 }),
        p({ line: "General Liability", carrier: C.plains, expires: 105, premium: 21_700, commission: 15, occ: 1 * M, agg: 2 * M, ded: 2_500, basis: "revenue", exposure: 11_300_000, endorsements: ["additional_insured"] }),
        p({ line: "Property", carrier: C.northgate, expires: 290, premium: 19_900, commission: 15, occ: null, agg: null, ded: 5_000, basis: "square_feet", exposure: 42_000 }),
      ],
    },

    // ---------- Retail ----------
    {
      name: "Copperfield Home & Garden Ltd.",
      industry: "retail",
      annualRevenue: 14_900_000,
      employeeCount: 120,
      province: "ON",
      producer: PRODUCERS[0],
      accountManager: MANAGERS[0],
      status: "active",
      notes: "Six garden-centre locations.",
      contacts: [{ name: "Winston Alcott", role: "President", email: "walcott@copperfieldhg.example", phone: "519-555-0184" }],
      policies: [
        p({ line: "Property", carrier: C.dominion, expires: 365, premium: 83_000, commission: 15, occ: null, agg: null, ded: 10_000, basis: "square_feet", exposure: 118_000 }),
        p({ line: "General Liability", carrier: C.maritime, expires: 365, premium: 36_200, commission: 15, occ: 2 * M, agg: 4 * M, ded: 5_000, basis: "revenue", exposure: 14_900_000, endorsements: ["additional_insured"] }),
        p({ line: "Commercial Auto", carrier: C.northgate, expires: 140, premium: 11_800, commission: 12.5, occ: 2 * M, agg: null, ded: 1_000, basis: "vehicles", exposure: 6 }),
      ],
    },
    {
      name: "Summit Row Outfitters Inc.",
      industry: "retail",
      annualRevenue: 4_100_000,
      employeeCount: 28,
      province: "BC",
      producer: PRODUCERS[1],
      accountManager: null,
      status: "prospect",
      notes: "Prospect met at the outdoor trade show; no policies placed yet.",
      contacts: [{ name: "Theo Vandermeer", role: "Co-founder", email: "theo@summitrow.example", phone: "250-555-0190" }],
      policies: [],
      accountTasks: [{ title: "Follow up on trade-show quote request", dueDate: d(7), owner: PRODUCERS[1], done: false }],
    },
  ];

  return finalizeBook(asOf, specs);
}

function isClosed(status: RenewalStatus): boolean {
  return status === "renewed" || status === "lost" || status === "non_renewed";
}

function dollars(n: number): string {
  return `$${n.toLocaleString("en-CA")}`;
}

/**
 * Turns specs into the final book: builds policies, gives about a third of the
 * open policies a partly completed checklist, and writes the activity entries
 * that recorded outcomes and completed checklists would have produced.
 */
function finalizeBook(asOf: ISODate, specs: AccountSpec[]): DemoAccount[] {
  let openIndex = 0;
  return specs.map((spec): DemoAccount => {
    const owner = spec.accountManager ?? spec.producer;
    const built = spec.policies.map((ps) => policy(asOf, owner, ps));
    const activities: DemoActivity[] = (spec.noteLog ?? []).map((body, i) => ({
      kind: "note" as const,
      body,
      policyKey: null,
      asOfDate: addDays(asOf, -(i + 2)).value,
    }));

    for (const pol of built) {
      if (!pol.priorTerm && !isClosed(pol.renewalStatus) && pol.checklist === null) {
        // Every third open policy has been worked on: between 1 and total − 1 items ticked.
        if (openIndex % 3 === 0) {
          const template = checklistTemplate(pol.lineOfBusiness).value;
          const doneCount = 1 + ((openIndex / 3) % (template.length - 1));
          pol.checklist = template.map((t, i) => ({ label: t.label, source: t.source, done: i < doneCount }));
        }
        openIndex += 1;
      }
      const label = `${pol.lineOfBusiness} · ${pol.carrier}`;
      if (pol.checklist && pol.checklist.every((i) => i.done)) {
        activities.push({
          kind: "checklist_complete",
          body: `${label} readiness checklist is complete: ready to market.`,
          policyKey: pol.key,
          asOfDate: addDays(asOf, -1).value,
        });
      }
      const outcome = pol.outcome;
      if (outcome?.type === "renewed") {
        const successor = built.find((x) => x.key === outcome.successorKey);
        if (!successor) throw new Error(`Demo book: successor ${outcome.successorKey} not found`);
        activities.push({
          kind: "outcome_recorded",
          body: `Outcome recorded for ${label}: renewed with ${successor.carrier} at ${dollars(successor.annualPremium)} (expiring ${dollars(pol.annualPremium)}), ${successor.effectiveDate} to ${successor.expiryDate}.`,
          policyKey: pol.key,
          asOfDate: outcome.recordedAsOf,
        });
      } else if (outcome?.type === "non_renewed") {
        activities.push({
          kind: "outcome_recorded",
          body: `Outcome recorded for ${label}: non-renewed by carrier. Reason: ${outcome.reason}`,
          policyKey: pol.key,
          asOfDate: outcome.recordedAsOf,
        });
      } else if (outcome?.type === "lost") {
        activities.push({
          kind: "outcome_recorded",
          body:
            `Outcome recorded for ${label}: lost (${LOST_REASON_LABELS[outcome.lostReason]}).` +
            (outcome.competingPremium !== null
              ? ` Competing premium ${dollars(outcome.competingPremium)} vs expiring ${dollars(pol.annualPremium)}.`
              : ""),
          policyKey: pol.key,
          asOfDate: outcome.recordedAsOf,
        });
      }
    }

    return {
      name: spec.name,
      industry: spec.industry,
      annualRevenue: spec.annualRevenue,
      employeeCount: spec.employeeCount,
      province: spec.province,
      producer: spec.producer,
      accountManager: spec.accountManager,
      status: spec.status,
      notes: spec.notes,
      brokerFees: spec.brokerFees ?? 0,
      riskControlSpend: spec.riskControlSpend ?? 0,
      claimsAdminCost: spec.claimsAdminCost ?? 0,
      contacts: spec.contacts,
      policies: built,
      accountTasks: spec.accountTasks ?? [],
      claims: spec.claims ?? [],
      towerLayers: spec.towerLayers ?? [],
      requirements: spec.requirements ?? [],
      certificates: spec.certificates ?? [],
      activities,
    };
  });
}
