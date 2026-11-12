/** Enumerations shared by the database schema, Zod schemas and the UI. */

export const APP_VERSION = "v0.1";

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
