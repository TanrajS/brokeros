/** Enumerations shared by the database schema, Zod schemas and the UI. */

export const APP_VERSION = "v0.2";

export const ACCOUNT_STATUSES = ["prospect", "active", "lost"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const INDUSTRIES = [
  "construction",
  "manufacturing",
  "hospitality",
  "professional services",
  "transportation",
  "retail",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type Province = (typeof PROVINCES)[number];

export const LINES_OF_BUSINESS = [
  "General Liability",
  "Property",
  "Commercial Auto",
  "Umbrella/Excess",
  "Workers Compensation",
  "Professional Liability",
  "Cyber",
  "Equipment Breakdown",
] as const;
export type LineOfBusiness = (typeof LINES_OF_BUSINESS)[number];

export const EXPOSURE_BASES = ["revenue", "payroll", "vehicles", "square_feet", "employees", "other"] as const;
export type ExposureBasis = (typeof EXPOSURE_BASES)[number];

export const ENDORSEMENTS = [
  "additional_insured",
  "waiver_of_subrogation",
  "primary_noncontributory",
  "notice_of_cancellation_30",
] as const;
export type Endorsement = (typeof ENDORSEMENTS)[number];

export const ENDORSEMENT_LABELS: Record<Endorsement, string> = {
  additional_insured: "Additional insured",
  waiver_of_subrogation: "Waiver of subrogation",
  primary_noncontributory: "Primary & non-contributory",
  notice_of_cancellation_30: "30-day notice of cancellation",
};

export const RENEWAL_STATUSES = ["not_started", "in_progress", "renewed", "lost", "non_renewed"] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  renewed: "Renewed",
  lost: "Lost",
  non_renewed: "Non-renewed",
};

export const EXPOSURE_BASIS_LABELS: Record<ExposureBasis, string> = {
  revenue: "Revenue",
  payroll: "Payroll",
  vehicles: "Vehicles",
  square_feet: "Square feet",
  employees: "Employees",
  other: "Other",
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  lost: "Lost",
};

/* ---------- v0.2 Renewals ---------- */

/** Statuses a user can set directly on a policy. The closed ones are only set by recording an outcome. */
export const OPEN_RENEWAL_STATUSES = ["not_started", "in_progress"] as const satisfies readonly RenewalStatus[];
export const CLOSED_RENEWAL_STATUSES = ["renewed", "lost", "non_renewed"] as const satisfies readonly RenewalStatus[];

export function isClosedRenewalStatus(s: RenewalStatus): boolean {
  return (CLOSED_RENEWAL_STATUSES as readonly string[]).includes(s);
}

export const OUTCOME_TYPES = ["renewed", "lost", "non_renewed"] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];
export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  renewed: "Renewed",
  lost: "Lost",
  non_renewed: "Non-renewed by carrier",
};

export const LOST_REASONS = ["price", "coverage", "service", "business_closed", "moved_broker", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  coverage: "Coverage",
  service: "Service",
  business_closed: "Business closed",
  moved_broker: "Moved to another broker",
  other: "Other",
};

export const CHECKLIST_SOURCES = ["common", "line", "custom"] as const;
export type ChecklistSource = (typeof CHECKLIST_SOURCES)[number];

export const ACTIVITY_KINDS = [
  "note",
  "stage_change",
  "checklist_complete",
  "outcome_recorded",
  "outcome_undone",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  note: "Note",
  stage_change: "Stage change",
  checklist_complete: "Checklist complete",
  outcome_recorded: "Outcome recorded",
  outcome_undone: "Outcome undone",
};
