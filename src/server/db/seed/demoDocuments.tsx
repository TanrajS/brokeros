/**
 * Seed documents (v1.4): short fictional PDFs for the demo book, generated once
 * and stored under the shared `seed/` prefix in Vercel Blob. Certificates are
 * rendered with the real certificate renderer from the demo policy data.
 */
import React from "react";
import { certificateContent, type CertificateInsurer, type CertificatePolicyInput } from "@/lib/domain/certificates";
import { policyYearLabel } from "@/lib/domain/documents";
import { renderCertificatePdf } from "@/server/certificates/pdf";
import { blobReady, uploadSeedBlob } from "@/server/documents/blob";
import { loadReactPdf, type ReactPdf, type Styles } from "@/server/pdf/reactPdf";
import type { DemoAccount, DemoDocument, DemoPolicy } from "./demoBookData";

const styles = {
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#1d1d1b", lineHeight: 1.5 },
  band: { borderBottomWidth: 2, borderBottomColor: "#2a78d6", paddingBottom: 8, marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  muted: { color: "#52514e", fontSize: 9 },
  para: { marginBottom: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#52514e", flexDirection: "row", justifyContent: "space-between" },
} satisfies Styles;

function SeedPdf({ account, d, asOf, pdf }: { account: DemoAccount; d: DemoDocument; asOf: string; pdf: ReactPdf }) {
  const { Document, Page, Text, View } = pdf;
  const pages: string[][] = [];
  for (let i = 0; i < d.paragraphs.length; i += 3) pages.push(d.paragraphs.slice(i, i + 3));
  if (pages.length === 0) pages.push(["(No body text.)"]);
  return (
    <Document title={d.title} author="Broker OS (fictional demo)">
      {pages.map((paras, n) => (
        <Page key={n} size="LETTER" style={styles.page}>
          <View style={styles.band}>
            <Text style={styles.title}>{d.title}</Text>
            <Text style={styles.muted}>
              {account.name} · {d.docType.replace("_", " ")} · prepared as of {asOf}
            </Text>
          </View>
          {paras.map((t, i) => (
            <Text key={i} style={styles.para}>
              {t}
            </Text>
          ))}
          <View style={styles.footer} fixed>
            <Text>All companies, insurers and people in this document are fictional.</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

const toCertificatePolicy = (p: DemoPolicy): CertificatePolicyInput => ({
  id: p.key,
  lineOfBusiness: p.lineOfBusiness,
  carrier: p.carrier,
  policyNumber: p.policyNumber,
  effectiveDate: p.effectiveDate,
  expiryDate: p.expiryDate,
  occurrenceLimit: p.occurrenceLimit,
  aggregateLimit: p.aggregateLimit,
  deductible: p.deductible,
  exposureBasis: p.exposureBasis,
  exposureAmount: p.exposureAmount,
  insurableValue: p.insurableValue,
  endorsements: p.endorsements,
});

/** Renders one seed document to PDF bytes. */
export async function renderSeedDocument(account: DemoAccount, d: DemoDocument, asOf: string): Promise<Buffer> {
  if (d.docType === "certificate" && d.certificate && d.policyKey) {
    const policy = account.policies.find((p) => p.key === d.policyKey);
    if (!policy) throw new Error(`Demo document ${d.key}: unknown policy ${d.policyKey}`);
    const group = policy.lineOfBusiness === "General Liability" ? "gl" : policy.lineOfBusiness === "Commercial Auto" ? "auto" : policy.lineOfBusiness === "Property" ? "property" : null;
    const layer = group ? (account.towerLayers.find((l) => l.lineGroup === group && l.policyKey === policy.key) ?? account.towerLayers.find((l) => l.lineGroup === group && l.attachment === 0) ?? null) : null;
    const insurers: CertificateInsurer[] = layer?.participations && layer.participations.length > 1 ? layer.participations.map((x) => ({ name: x.insurer, signedLinePct: x.signedLinePct })) : [];
    const included = d.certificate.includePolicyKeys.map((k) => account.policies.find((p) => p.key === k)).filter((p): p is DemoPolicy => !!p);
    const content = certificateContent({
      namedInsured: { name: account.name, province: account.province, industry: account.industry },
      holder: { name: d.certificate.holderName, address: d.certificate.holderAddress },
      operations: d.certificate.operations,
      issueDate: asOf,
      policy: toCertificatePolicy(policy),
      insurers,
      included: included.map(toCertificatePolicy),
    }).value;
    return renderCertificatePdf(content);
  }
  const pdf = await loadReactPdf();
  return pdf.renderToBuffer(<SeedPdf account={account} d={d} asOf={asOf} pdf={pdf} />);
}

export interface SeedBlob {
  url: string;
  pathname: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Makes sure every seed document has its blob under `seed/<key>.pdf`, uploading
 * only the ones that are missing, and returns the map the loader writes into
 * `documents`. Returns null when Blob is not configured (documents are skipped).
 */
export async function ensureSeedDocuments(book: DemoAccount[], asOf: string, log: (line: string) => void = () => {}): Promise<Map<string, SeedBlob> | null> {
  if (!blobReady()) {
    log("BLOB_READ_WRITE_TOKEN is not set: seed documents skipped.");
    return null;
  }
  const out = new Map<string, SeedBlob>();
  let uploaded = 0;
  for (const account of book) {
    for (const d of account.documents) {
      const pathname = `seed/${d.key}.pdf`;
      const pdf = await renderSeedDocument(account, d, asOf);
      const r = await uploadSeedBlob(pathname, pdf, "application/pdf");
      if (!r.reused) uploaded += 1;
      out.set(d.key, { url: r.url, pathname: r.pathname, fileName: `${d.key}.pdf`, sizeBytes: pdf.byteLength });
    }
  }
  log(`Seed documents: ${out.size} on file, ${uploaded} uploaded this run.`);
  return out;
}

/** Resolves a document's policy-year label from its linked policy. */
export function seedPolicyYear(d: DemoDocument, account: DemoAccount): string | null {
  if (d.policyYear === null) return null;
  const policy = d.policyKey ? account.policies.find((p) => p.key === d.policyKey) : null;
  if (d.policyYear === "current" || d.policyYear === "prior") {
    if (!policy) return null;
    const target = d.policyYear === "prior" && policy.previousKey ? (account.policies.find((p) => p.key === policy.previousKey) ?? policy) : policy;
    return policyYearLabel(target.effectiveDate, target.expiryDate);
  }
  return d.policyYear;
}
