/**
 * Certificates of insurance (v1.4): the content of a certificate, assembled
 * from the policy, its account and the program, so the on-screen preview and
 * the PDF render the same data. Pure. The wording and layout are Broker OS's
 * own; nothing here copies an industry form.
 */
import type { Endorsement, LineOfBusiness } from "@/lib/constants";
import { ENDORSEMENT_LABELS } from "@/lib/constants";
import type { Calc, ISODate } from "./types";

export interface CertificatePolicyInput {
  id: string;
  lineOfBusiness: LineOfBusiness;
  carrier: string;
  policyNumber: string | null;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  exposureBasis: string;
  exposureAmount: number | null;
  insurableValue: number | null;
  endorsements: Endorsement[];
  /** v1.5.1: coverage parts that carry their own limits (sublimits), listed under the headline limits. */
  coverageParts?: { appliesTo: string; occurrenceLimit: number | null; aggregateLimit: number | null }[];
}

export interface CertificateInsurer {
  name: string;
  /** Signed line in percent; 100 for a single insurer. */
  signedLinePct: number;
}

export interface CertificateInput {
  namedInsured: { name: string; province: string; industry: string };
  holder: { name: string; address: string };
  operations: string;
  issueDate: ISODate;
  policy: CertificatePolicyInput;
  /** Participations on the layer written on this policy; empty means the policy's own carrier at 100%. */
  insurers: CertificateInsurer[];
  /** Other in-force policies the broker ticked. */
  included: CertificatePolicyInput[];
}

export interface CertificateRow {
  label: string;
  value: string;
}

export interface CertificateContent {
  title: string;
  reference: string;
  issueDate: ISODate;
  namedInsured: string[];
  holder: string[];
  operations: string;
  /** The analysed policy's facts, label/value pairs. */
  policyRows: CertificateRow[];
  insurers: CertificateInsurer[];
  endorsementsPresent: string[];
  endorsementsAbsent: string[];
  includedRows: { line: string; insurer: string; policyNumber: string; period: string; limits: string }[];
  /** v1.5.1: "Stock: $25,000,000 per occurrence" rows for parts with their own limits; empty when none. */
  coveragePartRows: CertificateRow[];
  statement: string;
}

function dollars(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
const limits = (p: CertificatePolicyInput) => `${p.occurrenceLimit === null ? "—" : dollars(p.occurrenceLimit)} per occurrence / ${p.aggregateLimit === null ? "—" : dollars(p.aggregateLimit)} aggregate`;

export const CERTIFICATE_STATEMENT =
  "This certificate is issued for information only. It summarises the policies listed as they stand on the issue date and confers no rights on the holder beyond those the policies themselves provide. It does not amend, extend or alter the coverage afforded by those policies, and it may be withdrawn or reissued when a policy changes or renews.";

const TRACKED_ENDORSEMENTS: Endorsement[] = ["additional_insured", "waiver_of_subrogation", "primary_noncontributory", "notice_of_cancellation_30"];

/** Builds the certificate's content. The same object feeds the preview and the PDF. */
export function certificateContent(i: CertificateInput): Calc<CertificateContent> {
  const p = i.policy;
  const exposure =
    p.insurableValue !== null
      ? `TIV ${dollars(p.insurableValue)}`
      : p.exposureAmount === null
        ? "Exposure not entered"
        : p.exposureBasis === "revenue" || p.exposureBasis === "payroll"
          ? `${dollars(p.exposureAmount)} ${p.exposureBasis}`
          : `${p.exposureAmount.toLocaleString("en-CA")} ${p.exposureBasis.replace("_", " ")}`;
  const insurers = i.insurers.length ? i.insurers : [{ name: p.carrier, signedLinePct: 100 }];
  const present = TRACKED_ENDORSEMENTS.filter((e) => p.endorsements.includes(e)).map((e) => ENDORSEMENT_LABELS[e]);
  const absent = TRACKED_ENDORSEMENTS.filter((e) => !p.endorsements.includes(e)).map((e) => ENDORSEMENT_LABELS[e]);
  const reference = `COI-${p.id.slice(0, 8).toUpperCase()}-${i.issueDate.split("-").join("")}`;
  const content: CertificateContent = {
    title: "Certificate of Insurance",
    reference,
    issueDate: i.issueDate,
    namedInsured: [i.namedInsured.name, `${i.namedInsured.industry[0].toUpperCase()}${i.namedInsured.industry.slice(1)}, ${i.namedInsured.province}`],
    holder: [i.holder.name, ...i.holder.address.split(/\n+/).map((l) => l.trim()).filter(Boolean)],
    operations: i.operations,
    policyRows: [
      { label: "Coverage", value: p.lineOfBusiness },
      { label: insurers.length > 1 ? "Insurers" : "Insurer", value: insurers.map((x) => (insurers.length > 1 ? `${x.name} (${x.signedLinePct}%)` : x.name)).join("; ") },
      { label: "Policy number", value: p.policyNumber ?? "Not entered" },
      { label: "Coverage period", value: `${p.effectiveDate} to ${p.expiryDate}` },
      { label: "Limits", value: limits(p) },
      { label: "Deductible (all other perils)", value: p.deductible === null ? "None recorded" : dollars(p.deductible) },
      { label: "Exposure", value: exposure },
    ],
    insurers,
    coveragePartRows: (p.coverageParts ?? [])
      .filter((c) => c.occurrenceLimit !== null || c.aggregateLimit !== null)
      .map((c) => ({ label: c.appliesTo, value: [c.occurrenceLimit !== null ? `${dollars(c.occurrenceLimit)} per occurrence` : null, c.aggregateLimit !== null ? `${dollars(c.aggregateLimit)} aggregate` : null].filter(Boolean).join(" / ") })),
    endorsementsPresent: present,
    endorsementsAbsent: absent,
    includedRows: i.included.map((x) => ({ line: x.lineOfBusiness, insurer: x.carrier, policyNumber: x.policyNumber ?? "Not entered", period: `${x.effectiveDate} to ${x.expiryDate}`, limits: limits(x) })),
    statement: CERTIFICATE_STATEMENT,
  };
  return {
    value: content,
    math: {
      inputs: { policy: p.id, issueDate: i.issueDate, insurers: insurers.length, included: i.included.length },
      formula: "named insured, insurers with signed lines, policy facts, endorsements present and absent, included coverages, holder, issue date and the informational statement",
      steps: { lines: [`Reference ${reference}; ${insurers.length} insurer(s); ${present.length} of ${TRACKED_ENDORSEMENTS.length} tracked endorsements present; ${content.coveragePartRows.length} coverage part(s) with their own limits; ${i.included.length} included coverage row(s)`] },
    },
  };
}
