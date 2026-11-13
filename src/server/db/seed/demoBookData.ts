/**
 * The fictional demo book, built relative to an as-of date so the day offsets
 * always hold. Pure data: no database, no clock.
 *
 * Every company, carrier, person and email here is invented. Any resemblance to
 * a real insurer or business is coincidental.
 */
import { addDays, daysBetween } from "@/lib/domain/dates";
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
} from "@/lib/constants";
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
  | { type: "lost"; lostReason: LostReason; competingPremium: number | null; recordedAsOf: ISODate };

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
  /** A prior-year term kept for history; excluded from the v0.1 date-range rules. */
  priorTerm: boolean;
  /** Null means the checklist has not been opened yet (it is generated on first open). */
  checklist: DemoChecklistItem[] | null;
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
  contacts: DemoContact[];
  policies: DemoPolicy[];
  /** Tasks on the account that are not tied to a policy. */
  accountTasks: DemoTask[];
  activities: DemoActivity[];
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

type AccountSpec = Omit<DemoAccount, "policies" | "accountTasks" | "activities"> & {
  policies: PolicySpec[];
  accountTasks?: DemoTask[];
  noteLog?: string[];
};

export function buildDemoBook(asOf: ISODate): DemoAccount[] {
  policySeq = 0;
  const d = (days: number) => addDays(asOf, days).value;
  const p = (spec: PolicySpec) => spec;
  const stdGl: Endorsement[] = ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"];

  // Cedar Ridge's current GL ends 120 days out; its prior-year term ended when the current one began.
  const cedarCurrentEffective = addDays(d(120), -365).value;
  // Northfield's GL expired 30 days ago and was renewed: successor runs 12 months from that expiry.
  const northfieldRenewal = planSuccessorTerm(d(-30)).value;

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
      notes: "Mechanical contractor: HVAC and plumbing for commercial builds. Later versions attach loss runs, towers and quotes here.",
      noteLog: ["Owen asked whether a higher umbrella limit is needed for the new hospital project. Discuss at the strategy meeting."],
      contacts: [
        { name: "Owen Castellanos", role: "CFO", email: "owen.castellanos@cedarridgemech.example", phone: "604-555-0142" },
        { name: "Mei-Lin Harper", role: "Office Manager", email: "mharper@cedarridgemech.example", phone: "604-555-0188" },
      ],
      policies: [
        p({ key: "cedar-gl-prior", priorTerm: true, line: "General Liability", carrier: C.northgate, expires: daysBetween(asOf, cedarCurrentEffective).value, premium: 100_000, commission: 15, occ: 1 * M, agg: 2 * M, ded: 5_000, basis: "revenue", exposure: 20 * M, endorsements: ["additional_insured"], status: "renewed", outcome: { type: "renewed", successorKey: "cedar-gl", recordedAsOf: addDays(cedarCurrentEffective, -14).value }, notes: "Prior-year term: $100,000 on $20,000,000 revenue." }),
        p({ key: "cedar-gl", previousKey: "cedar-gl-prior", line: "General Liability", carrier: C.northgate, expires: 120, premium: 108_000, commission: 15, occ: 1 * M, agg: 2 * M, ded: 5_000, basis: "revenue", exposure: 23 * M, endorsements: ["additional_insured"], notes: "Expires exactly 120 days after the as-of date. Renewed from the prior year: premium up 8% on 15% more revenue." }),
        p({ line: "Property", carrier: C.northgate, expires: 120, premium: 42_500, commission: 15, occ: null, agg: null, ded: 10_000, basis: "square_feet", exposure: 38_000 }),
        p({ line: "Commercial Auto", carrier: C.dominion, expires: 120, premium: 61_200, commission: 12.5, occ: 2 * M, agg: null, ded: 2_500, basis: "vehicles", exposure: 34 }),
        p({ line: "Umbrella/Excess", carrier: C.boreal, expires: 120, premium: 27_800, commission: 12, occ: 5 * M, agg: 5 * M, ded: null, basis: "revenue", exposure: 23 * M, endorsements: ["additional_insured"] }),
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
        p({ line: "General Liability", carrier: C.aurora, expires: 121, premium: 186_000, commission: 15, occ: 2 * M, agg: 4 * M, ded: 25_000, basis: "revenue", exposure: 41 * M, endorsements: stdGl, notes: "Expires exactly 121 days after the as-of date." }),
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
      notes: "Frozen seafood processor with two plants. Later versions attach loss runs, towers and quotes here.",
      noteLog: ["Plant expansion in the first quarter will add roughly 20% to payroll. Update exposure figures before marketing."],
      contacts: [
        { name: "Rosalind Achebe", role: "VP Finance", email: "rachebe@harbourlinefoods.example", phone: "416-555-0163" },
        { name: "Felix Dufresne", role: "Plant Manager", email: "fdufresne@harbourlinefoods.example", phone: "416-555-0171" },
      ],
      policies: [
        p({ standardTasksDone: ["Strategy meeting"], line: "General Liability", carrier: C.dominion, expires: 60, premium: 150_000, commission: 12.5, occ: 1 * M, agg: 2 * M, ded: 10_000, basis: "revenue", exposure: 25 * M, endorsements: stdGl, notes: "Expires exactly 60 days after the as-of date." }),
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
        p({ line: "Property", carrier: C.aurora, expires: 90, premium: 420_000, commission: 10, occ: null, agg: null, ded: 50_000, basis: "square_feet", exposure: 210_000, standardTasksDone: ["Strategy meeting"], checklistComplete: true, notes: "Expires exactly 90 days after the as-of date. Largest premium in the book." }),
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
        p({ line: "Property", carrier: C.plains, expires: -30, premium: 96_200, commission: 15, occ: null, agg: null, ded: 25_000, basis: "square_feet", exposure: 72_000, status: "in_progress", standardTasksDone: ["Strategy meeting", "Submit to market", "Compare quotes"], notes: "Expired 30 days before the as-of date with no renewal bound yet." }),
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
        p({ standardTasksDone: ["Strategy meeting", "Submit to market", "Compare quotes"], line: "General Liability", carrier: C.maritime, expires: 0, premium: 38_700, commission: 15, occ: 2 * M, agg: 4 * M, ded: 2_500, basis: "revenue", exposure: 9_600_000, endorsements: ["additional_insured", "notice_of_cancellation_30"], status: "in_progress", notes: "Expires on the as-of date (0 days)." }),
        p({ line: "Property", carrier: C.maritime, expires: 0, premium: 52_100, commission: 15, occ: null, agg: null, ded: 5_000, basis: "square_feet", exposure: 24_500, status: "in_progress" }),
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
        p({ line: "Professional Liability", carrier: C.maritime, expires: 330, premium: 28_600, commission: 15, occ: 2 * M, agg: 4 * M, ded: 10_000, basis: "revenue", exposure: 6_200_000 }),
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
        p({ standardTasksDone: ["Strategy meeting", "Submit to market"], line: "Commercial Auto", carrier: C.dominion, expires: 15, premium: 398_000, commission: 10, occ: 5 * M, agg: null, ded: 10_000, basis: "vehicles", exposure: 140, endorsements: ["additional_insured", "notice_of_cancellation_30"], status: "in_progress" }),
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
        p({ line: "Property", carrier: C.maritime, expires: 365, premium: 83_000, commission: 15, occ: null, agg: null, ded: 10_000, basis: "square_feet", exposure: 118_000 }),
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
      contacts: spec.contacts,
      policies: built,
      accountTasks: spec.accountTasks ?? [],
      activities,
    };
  });
}
