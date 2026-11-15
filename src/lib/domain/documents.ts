/**
 * Documents (v1.4): the account's filing cabinet in Vercel Blob. Pure rules:
 * folders, allowed files, the policy-year label and the certificate reissue
 * rule. No React, no database, no clock.
 */
import type { Calc, ISODate } from "./types";

export const DOCUMENT_TYPES = ["proposal", "submission", "certificate", "policy_document"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = { proposal: "Proposals", submission: "Submissions", certificate: "Certificates", policy_document: "Policy documents" };
export const DOCUMENT_TYPE_SINGULAR: Record<DocumentType, string> = { proposal: "Proposal", submission: "Submission", certificate: "Certificate", policy_document: "Policy document" };

export const DOCUMENT_STATUSES = ["draft", "final"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** 10 MB cap on uploads. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Allowed uploads by extension, with the MIME type each is stored as. */
export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** The extension of a file name, lower-cased, without the dot; "" when there is none. */
export function fileExtension(fileName: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Checks a file's name and size against the allowed list and the cap; the stored MIME type comes from the extension, never from the browser. */
export function checkDocumentFile(fileName: string, sizeBytes: number): Calc<{ ok: boolean; mimeType: string | null; reason: string | null }> {
  const ext = fileExtension(fileName);
  const mimeType = ALLOWED_DOCUMENT_TYPES[ext] ?? null;
  let reason: string | null = null;
  if (!fileName.trim()) reason = "Choose a file";
  else if (!mimeType) reason = `Only ${Object.keys(ALLOWED_DOCUMENT_TYPES).filter((e) => e !== "jpeg").join(", ")} files can be uploaded`;
  else if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) reason = "The file is empty";
  else if (sizeBytes > MAX_DOCUMENT_BYTES) reason = `Files must be 10 MB or smaller (this one is ${(sizeBytes / (1024 * 1024)).toFixed(1)} MB)`;
  return {
    value: { ok: reason === null, mimeType: reason === null ? mimeType : null, reason },
    math: { inputs: { fileName, sizeBytes }, formula: "extension in the allowed list and size within 10 MB", steps: { lines: [reason ?? `${ext} accepted as ${mimeType}`] } },
  };
}

/** "2025-26" for a term from 2025-11-12 to 2026-11-12; "2026" when both dates fall in the same year. */
export function policyYearLabel(effectiveDate: ISODate, expiryDate: ISODate): string {
  const a = effectiveDate.slice(0, 4);
  const b = expiryDate.slice(0, 4);
  return a === b ? a : `${a}-${b.slice(2)}`;
}

export interface CertificateReissueInput {
  policyId: string;
  expiryDate: ISODate;
  /** Ids of policies whose previous_policy_id is this policy. */
  successorIds: string[];
}

/** A certificate needs reissue when its policy has been renewed into a successor or has expired at the as-of date. */
export function certificateReissueNeeded(policy: CertificateReissueInput, asOf: ISODate): Calc<{ reissueNeeded: boolean; reason: string | null }> {
  const renewed = policy.successorIds.length > 0;
  const expired = policy.expiryDate <= asOf;
  const reason = renewed ? "the policy has been renewed into a successor term" : expired ? `the policy expired on ${policy.expiryDate}` : null;
  return {
    value: { reissueNeeded: reason !== null, reason },
    math: { inputs: { policyId: policy.policyId, expiryDate: policy.expiryDate, successors: policy.successorIds.length, asOf }, formula: "reissue needed when a successor exists or expiry ≤ as-of", steps: { lines: [reason ?? "current term, no successor: the certificate stands"] } },
  };
}
