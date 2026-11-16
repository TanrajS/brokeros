import React from "react";
import { PLACEMENT_FILL, type ProgramSummaryContent, type SummaryLayerBlock } from "@/lib/domain/programSummary";
import { loadReactPdf, type ReactPdf, type Styles } from "@/server/pdf/reactPdf";

/**
 * The Program summary PDF (v1.5). Landscape Letter, legible on A4 too. Draws
 * `programSummaryContent` with react-pdf primitives: tiles, the tower diagram to
 * scale with insurer segments by placed share, the Placement column, the
 * segment table and the participation table with 100% and actual premiums.
 * Every segment is labelled with its insurer key, so nothing rests on colour.
 */
const INK = "#1d1d1b";
const MUTED = "#52514e";
const LINE = "#e6e5e1";
const styles = {
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 34, fontSize: 8.5, fontFamily: "Helvetica", color: INK },
  band: { borderBottomWidth: 2, borderBottomColor: "#2a78d6", paddingBottom: 6, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, marginTop: 2 },
  muted: { color: MUTED },
  heading: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 8 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tile: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 6 },
  tileLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  tileValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6, fontSize: 7.5 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  swatch: { width: 8, height: 8, borderRadius: 1 },
  diagram: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginBottom: 8 },
  axis: { width: 46, height: 200, position: "relative" },
  axisLabel: { position: "absolute", right: 2, fontSize: 7, color: MUTED },
  tower: { flex: 1, flexDirection: "column", alignItems: "stretch" },
  towerBox: { height: 200, borderWidth: 1, borderColor: LINE, borderRadius: 3, position: "relative" },
  towerLabel: { textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 3 },
  layerBlock: { position: "absolute", left: 3, right: 3, flexDirection: "row", borderWidth: 1, borderColor: "#2a78d6", borderRadius: 2, overflow: "hidden", backgroundColor: "#ffffff" },
  segment: { alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 1 },
  segmentText: { color: "#ffffff", fontSize: 6.5, fontFamily: "Helvetica-Bold" },
  placedTag: { position: "absolute", top: 0, left: 0, minWidth: 52, backgroundColor: "#ffffff", paddingHorizontal: 2, paddingVertical: 1, fontSize: 6, fontFamily: "Helvetica-Bold", color: INK, borderBottomRightRadius: 2 },
  placement: { width: 110, flexDirection: "column" },
  placementBox: { height: 200, borderWidth: 1, borderColor: LINE, borderRadius: 3, position: "relative" },
  placementBlock: { position: "absolute", left: 3, right: 3, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ffffff", borderRadius: 2, overflow: "hidden" },
  placementText: { color: "#ffffff", fontSize: 7, fontFamily: "Helvetica-Bold" },
  placementSub: { color: "#ffffff", fontSize: 6 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 3, marginBottom: 8 },
  th: { flexDirection: "row", backgroundColor: "#f0efec", paddingVertical: 3, paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  td: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: LINE },
  tdTotal: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: LINE, backgroundColor: "#f7f6f3", fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  finding: { fontSize: 8, color: "#9b1c1c", marginBottom: 2 },
  footer: { position: "absolute", bottom: 18, left: 34, right: 34, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  footerText: { flex: 1, paddingRight: 16 },
  footerPage: { width: 60, textAlign: "right" },
} satisfies Styles;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (ratio: number, d = 2) => `${(ratio * 100).toFixed(d)}%`;
const pctPts = (n: number) => `${(+n.toFixed(3)).toString()}%`;
const compact = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(1)}K` : `$${n}`);
const H = 200;

function LayerBlock({ b, top, colorOf, pdf }: { b: SummaryLayerBlock; top: number; colorOf: Map<string, string>; pdf: ReactPdf }) {
  const { View, Text } = pdf;
  const bottom = (b.attachment / top) * H;
  const height = Math.max(14, ((b.exhaustion - b.attachment) / top) * H);
  return (
    <View style={[styles.layerBlock, { bottom, height: Math.min(height, H - bottom) }]}>
      {b.segments.map((s) => (
        <View key={`${b.id}-${s.insurerKey}`} style={[styles.segment, { flexGrow: s.shareOfPlaced, flexBasis: 0, backgroundColor: colorOf.get(s.insurerKey) ?? MUTED }]}>
          <Text style={styles.segmentText}>
            {s.insurerKey} {pctPts(s.signedLinePct)}
          </Text>
        </View>
      ))}
      {b.segments.length === 0 ? (
        <View style={[styles.segment, { flexGrow: 1 }]}>
          <Text style={[styles.muted, { fontSize: 6.5 }]}>No insurers</Text>
        </View>
      ) : null}
      <Text style={styles.placedTag}>{b.placedLabel}</Text>
    </View>
  );
}

export function ProgramSummaryPdf({ c, pdf }: { c: ProgramSummaryContent; pdf: ReactPdf }) {
  const { Document, Page, Text, View } = pdf;
  const colorOf = new Map(c.insurers.map((x) => [x.key, x.color]));
  const col = {
    seg: { width: 150 },
    layers: { flex: 1 },
    pct: { width: 60 },
    status: { width: 95, paddingLeft: 10 },
    short: { width: 80 },
    rol: { width: 80 },
    tower: { width: 50 },
    layer: { width: 85 },
    insurer: { flex: 1 },
    line: { width: 55 },
    prem: { width: 80 },
    exposed: { width: 85 },
    share: { width: 55 },
  } as const;
  return (
    <Document title={`${c.title} ${c.accountName} ${c.lineGroupLabel} ${c.asOf}`} author="Broker OS (fictional demo)">
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.band}>
          <View>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.subtitle}>
              {c.accountName} · {c.lineGroupLabel} · as of {c.asOfLabel}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text>{c.workspaceName}</Text>
            <Text style={styles.muted}>Prepared with Broker OS</Text>
          </View>
        </View>

        <View style={styles.tiles}>
          {c.tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue}>{t.value}</Text>
            </View>
          ))}
        </View>

        {c.findings.map((f) => (
          <Text key={f} style={styles.finding}>
            {f}
          </Text>
        ))}

        <Text style={styles.heading}>Towers and placement</Text>
        <View style={styles.legend}>
          {c.insurers.map((x) => (
            <View key={x.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: x.color }]} />
              <Text>
                {x.key} = {x.name}
              </Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: PLACEMENT_FILL.full }]} />
            <Text>100% placed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: PLACEMENT_FILL.off }]} />
            <Text>Below or above 100% (labelled short or over)</Text>
          </View>
        </View>
        <View style={styles.diagram} wrap={false}>
          <View style={styles.axis}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <Text key={f} style={[styles.axisLabel, { bottom: f * H - (f === 1 ? 8 : f === 0 ? 0 : 4) }]}>
                {compact(Math.round(c.programTop * f))}
              </Text>
            ))}
          </View>
          {c.towers.map((t) => (
            <View key={t.label} style={styles.tower}>
              <View style={styles.towerBox}>
                {t.layers.map((b) => (
                  <LayerBlock key={b.id} b={b} top={c.programTop} colorOf={colorOf} pdf={pdf} />
                ))}
              </View>
              <Text style={styles.towerLabel}>{t.label}</Text>
            </View>
          ))}
          <View style={styles.placement}>
            <View style={styles.placementBox}>
              {c.coverage.map((seg) => {
                const bottom = (seg.from / c.programTop) * H;
                const height = Math.max(14, ((seg.to - seg.from) / c.programTop) * H);
                const full = seg.status === "fully_placed";
                return (
                  <View key={`${seg.from}-${seg.to}`} style={[styles.placementBlock, { bottom, height: Math.min(height, H - bottom), backgroundColor: full ? PLACEMENT_FILL.full : PLACEMENT_FILL.off }]}>
                    <Text style={styles.placementText}>
                      {Math.round(seg.placedShare * 100)}%{seg.status === "over_placed" ? " over" : full ? "" : " short"}
                    </Text>
                    <Text style={styles.placementSub}>
                      {compact(seg.from)} to {compact(seg.to)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.towerLabel}>Placement</Text>
          </View>
        </View>

        <Text style={styles.heading}>Placement by segment</Text>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={col.seg}>Segment ($)</Text>
            <Text style={col.layers}>Layers covering it</Text>
            <Text style={[col.pct, styles.right]}>Placed (%)</Text>
            <Text style={col.status}>Status</Text>
            <Text style={[col.short, styles.right]}>Short ($)</Text>
            <Text style={[col.rol, styles.right]}>Blended rate on line (%)</Text>
          </View>
          {c.coverage.map((seg) => (
            <View key={`${seg.from}-${seg.to}`} style={styles.td}>
              <Text style={col.seg}>
                {money(seg.from)} to {money(seg.to)}
              </Text>
              <Text style={col.layers}>{seg.layers}</Text>
              <Text style={[col.pct, styles.right]}>{pct(seg.placedShare)}</Text>
              <Text style={col.status}>{seg.statusLabel}</Text>
              <Text style={[col.short, styles.right]}>{seg.shortDollars > 0 ? money(seg.shortDollars) : "—"}</Text>
              <Text style={[col.rol, styles.right]}>{seg.blendedRateOnLine === null ? "—" : pct(seg.blendedRateOnLine, 4)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.heading}>Insurer lines (premiums quoted at 100% of the layer; actual = 100% premium × signed line)</Text>
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={col.tower}>Tower</Text>
            <Text style={col.layer}>Layer</Text>
            <Text style={col.insurer}>Insurer</Text>
            <Text style={[col.line, styles.right]}>Written (%)</Text>
            <Text style={[col.line, styles.right]}>Signed (%)</Text>
            <Text style={[col.prem, styles.right]}>100% premium ($)</Text>
            <Text style={[col.prem, styles.right]}>Actual premium ($)</Text>
            <Text style={[col.exposed, styles.right]}>Exposed limit ($)</Text>
            <Text style={[col.rol, styles.right]}>Rate on line (%)</Text>
            <Text style={[col.share, styles.right]}>Share (%)</Text>
          </View>
          {c.participationRows.map((r, k) =>
            r.kind === "participation" ? (
              <View key={k} style={styles.td}>
                <Text style={col.tower}>{r.tower}</Text>
                <Text style={col.layer}>{r.layer}</Text>
                <Text style={col.insurer}>
                  {r.insurer}
                  {r.isLead ? " (lead)" : ""}
                </Text>
                <Text style={[col.line, styles.right]}>{r.writtenLinePct === null ? "—" : pctPts(r.writtenLinePct)}</Text>
                <Text style={[col.line, styles.right]}>{pctPts(r.signedLinePct)}</Text>
                <Text style={[col.prem, styles.right]}>{money(r.premium100)}</Text>
                <Text style={[col.prem, styles.right]}>{money(r.actualPremium)}</Text>
                <Text style={[col.exposed, styles.right]}>{money(r.exposedLimit)}</Text>
                <Text style={[col.rol, styles.right]}>{r.rateOnLine === null ? "—" : pct(r.rateOnLine, 4)}</Text>
                <Text style={[col.share, styles.right]}>{r.shareOfPremium === null ? "—" : pct(r.shareOfPremium, 1)}</Text>
              </View>
            ) : (
              <View key={k} style={styles.tdTotal}>
                <Text style={col.tower}>{r.tower}</Text>
                <Text style={col.layer}>{r.layer}</Text>
                <Text style={col.insurer}>Layer total</Text>
                <Text style={[col.line, styles.right]} />
                <Text style={[col.line, styles.right]}>
                  {pct(r.placedShare, 1)}
                  {r.underPlacedPct > 0 ? ` (short ${pctPts(r.underPlacedPct)})` : r.overPlacedPct > 0 ? ` (over ${pctPts(r.overPlacedPct)})` : ""}
                </Text>
                <Text style={[col.prem, styles.right]}>{r.premium100Equivalent === null ? "—" : `${money2(r.premium100Equivalent)} (100% equivalent)`}</Text>
                <Text style={[col.prem, styles.right]}>{money(r.layerPremium)}</Text>
                <Text style={[col.exposed, styles.right]}>{money(r.placedLimit)}</Text>
                <Text style={[col.rol, styles.right]}>{r.rateOnLine === null ? "—" : pct(r.rateOnLine, 4)}</Text>
                <Text style={[col.share, styles.right]}>100%</Text>
              </View>
            ),
          )}
          <View style={styles.tdTotal}>
            <Text style={{ flex: 1 }}>Program total (actual premiums)</Text>
            <Text style={[col.prem, styles.right]}>{money(c.totals.programPremium)}</Text>
            <Text style={[col.exposed, styles.right]}>{money(c.totals.placedLimit)}</Text>
            <Text style={[col.rol, styles.right]}>{c.totals.placedLimit > 0 ? pct(c.totals.programPremium / c.totals.placedLimit, 4) : "—"}</Text>
            <Text style={[col.share, styles.right]} />
          </View>
        </View>
        <Text>
          Program premium {money(c.totals.programPremium)} (actual) · placed limit {money(c.totals.placedLimit)}
          {c.totals.tiv !== null ? ` · TIV ${money(c.totals.tiv)}` : ""}
          {c.totals.ratePer100Tiv !== null ? ` · $${c.totals.ratePer100Tiv.toFixed(4)} per $100 of TIV` : ""} · {c.fullyPlaced ? "100% placed at every point" : `${money(c.totalShortDollars)} short of 100%`}
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{c.footer}</Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderProgramSummaryPdf(c: ProgramSummaryContent): Promise<Buffer> {
  const pdf = await loadReactPdf();
  return pdf.renderToBuffer(<ProgramSummaryPdf c={c} pdf={pdf} />);
}
