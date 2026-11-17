import React from "react";
import type { CertificateContent } from "@/lib/domain/certificates";
import { loadReactPdf, type ReactPdf, type Styles } from "@/server/pdf/reactPdf";

/**
 * The certificate PDF. Layout and wording are Broker OS's own: a header band,
 * two address blocks, a facts table, endorsement lists, included coverages and
 * the informational statement. Rendered server-side; no external service.
 */
const styles = {
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1d1d1b" },
  band: { borderBottomWidth: 2, borderBottomColor: "#2a78d6", paddingBottom: 8, marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  muted: { color: "#52514e" },
  columns: { flexDirection: "row", gap: 16, marginBottom: 12 },
  column: { flex: 1, borderWidth: 1, borderColor: "#e6e5e1", borderRadius: 4, padding: 8 },
  heading: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#52514e", marginBottom: 4, textTransform: "uppercase" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e6e5e1", paddingVertical: 4 },
  label: { width: 150, color: "#52514e" },
  value: { flex: 1 },
  table: { borderWidth: 1, borderColor: "#e6e5e1", borderRadius: 4, marginBottom: 12 },
  th: { flexDirection: "row", backgroundColor: "#f0efec", paddingVertical: 4, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 9 },
  td: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#e6e5e1" },
  cellLine: { width: 110 },
  cellInsurer: { flex: 1 },
  cellNumber: { width: 90 },
  cellPeriod: { width: 110 },
  cellLimits: { flex: 1.2 },
  section: { marginBottom: 12 },
  statement: { marginTop: 8, padding: 8, backgroundColor: "#f7f6f3", borderRadius: 4, fontSize: 9, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#52514e", flexDirection: "row", justifyContent: "space-between" },
} satisfies Styles;

export function CertificatePdf({ c, pdf }: { c: CertificateContent; pdf: ReactPdf }) {
  const { Document, Page, Text, View } = pdf;
  return (
    <Document title={`${c.title} ${c.reference}`} author="Broker OS (fictional demo)">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.band}>
          <View>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.muted}>Broker OS · informational summary of coverage</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text>Reference {c.reference}</Text>
            <Text style={styles.muted}>Issued {c.issueDate}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.heading}>Named insured</Text>
            {c.namedInsured.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.heading}>Certificate holder</Text>
            {c.holder.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Description of operations</Text>
          <Text>{c.operations}</Text>
        </View>

        <View style={[styles.table, { paddingHorizontal: 6 }]}>
          {c.policyRows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.value}>{r.value}</Text>
            </View>
          ))}
          {c.coveragePartRows.length ? (
            <View style={styles.row}>
              <Text style={styles.label}>Sublimits</Text>
              <View style={styles.value}>
                {c.coveragePartRows.map((r) => (
                  <Text key={r.label}>
                    {r.label}: {r.value}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.label}>Endorsements present</Text>
            <Text style={styles.value}>{c.endorsementsPresent.length ? c.endorsementsPresent.join("; ") : "None of the tracked endorsements"}</Text>
          </View>
          {c.endorsementsAbsent.length ? (
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.label}>Not included</Text>
              <Text style={[styles.value, styles.muted]}>{c.endorsementsAbsent.join("; ")}</Text>
            </View>
          ) : null}
        </View>

        {c.insurers.length > 1 ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Subscribing insurers and signed lines</Text>
            {c.insurers.map((x) => (
              <Text key={x.name}>
                {x.name}: {x.signedLinePct}%
              </Text>
            ))}
          </View>
        ) : null}

        {c.includedRows.length ? (
          <View style={styles.table}>
            <View style={styles.th}>
              <Text style={styles.cellLine}>Also in force</Text>
              <Text style={styles.cellInsurer}>Insurer</Text>
              <Text style={styles.cellNumber}>Policy number</Text>
              <Text style={styles.cellPeriod}>Period</Text>
              <Text style={styles.cellLimits}>Limits</Text>
            </View>
            {c.includedRows.map((r, i) => (
              <View key={i} style={styles.td}>
                <Text style={styles.cellLine}>{r.line}</Text>
                <Text style={styles.cellInsurer}>{r.insurer}</Text>
                <Text style={styles.cellNumber}>{r.policyNumber}</Text>
                <Text style={styles.cellPeriod}>{r.period}</Text>
                <Text style={styles.cellLimits}>{r.limits}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.statement}>{c.statement}</Text>

        <View style={styles.footer} fixed>
          <Text>All parties, insurers and policies in this demo are fictional.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(c: CertificateContent): Promise<Buffer> {
  const pdf = await loadReactPdf();
  return pdf.renderToBuffer(<CertificatePdf c={c} pdf={pdf} />);
}
