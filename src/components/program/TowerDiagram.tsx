import { cn } from "cn";
import { compactDollars, type TowerAnalysis } from "@/lib/domain/program";
import { formatCurrency } from "@/lib/format";

type Block =
  | { kind: "layer"; key: string; label: string; carrier: string; from: number; to: number; span: number; flagged: boolean }
  | { kind: "gap" | "overlap"; key: string; amount: number; from: number; to: number; span: number };

/** Blocks bottom-up: layers in attachment order, with gap and overlap bands between them. */
function blocksFor(t: TowerAnalysis): Block[] {
  const flagged = new Set(t.findings.filter((f) => f.kind === "primary_not_at_zero" || f.kind === "rate_inversion").map((f) => f.layerId));
  const out: Block[] = [];
  t.layers.forEach((l, i) => {
    const below = t.layers[i - 1];
    if (below) {
      const diff = l.attachment - below.exhaustion;
      if (diff > 0) out.push({ kind: "gap", key: `gap-${l.id}`, amount: diff, from: below.exhaustion, to: l.attachment, span: diff });
      if (diff < 0) out.push({ kind: "overlap", key: `overlap-${l.id}`, amount: -diff, from: l.attachment, to: below.exhaustion, span: -diff });
    }
    out.push({ kind: "layer", key: l.id, label: l.label, carrier: l.carrier, from: l.attachment, to: l.exhaustion, span: l.limit, flagged: flagged.has(l.id) });
  });
  return out;
}

const HATCH_RED = "repeating-linear-gradient(135deg, rgba(220,38,38,0.35) 0 6px, rgba(220,38,38,0.08) 6px 12px)";
const HATCH_AMBER = "repeating-linear-gradient(45deg, rgba(217,119,6,0.4) 0 6px, rgba(217,119,6,0.1) 6px 12px)";

/**
 * The tower as stacked blocks: vertical (primary at the bottom) from the md
 * breakpoint, a horizontal strip below it. Block size is proportional to the
 * dollar span, with a floor so small layers stay readable. Gaps are hatched red,
 * overlaps hatched amber. The table beside carries the same figures.
 */
export function TowerDiagram({ analysis }: { analysis: TowerAnalysis }) {
  const blocks = blocksFor(analysis);
  if (blocks.length === 0) return null;
  const total = blocks.reduce((s, b) => s + b.span, 0) || 1;
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="flex h-32 w-full flex-row gap-0.5 overflow-x-auto md:h-[26rem] md:flex-col-reverse md:overflow-visible" role="img" aria-label={towerAltText(analysis)}>
        {blocks.map((b) => {
          const style = { flex: `${Math.max(b.span / total, 0.06)} 1 0%` };
          if (b.kind === "layer") {
            return (
              <div
                key={b.key}
                style={style}
                className={cn(
                  "flex min-w-28 flex-col justify-center gap-0.5 rounded-md border px-2 py-1 text-xs md:min-h-14 md:min-w-0",
                  b.flagged ? "border-amber-500 bg-amber-50" : "border-primary/40 bg-primary/10",
                )}
              >
                <span className="font-semibold">{b.label}</span>
                <span className="truncate text-muted-foreground">{b.carrier}</span>
                <span className="tabular-nums text-muted-foreground">
                  {compactDollars(b.from)} → {compactDollars(b.to)}
                </span>
              </div>
            );
          }
          return (
            <div
              key={b.key}
              style={{ ...style, backgroundImage: b.kind === "gap" ? HATCH_RED : HATCH_AMBER }}
              className={cn("flex min-w-24 items-center justify-center rounded-md border px-2 text-center text-xs font-medium md:min-h-10 md:min-w-0", b.kind === "gap" ? "border-red-600 text-red-800" : "border-amber-600 text-amber-900")}
            >
              {b.kind === "gap" ? "Gap" : "Overlap"} {formatCurrency(b.amount)}
            </div>
          );
        })}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {analysis.continuous ? `Continuous to ${formatCurrency(analysis.topExhaustion ?? 0)}.` : "Not continuous."} Red hatching marks a gap, amber an overlap; blocks are drawn to scale with a minimum size.
      </figcaption>
    </figure>
  );
}

function towerAltText(t: TowerAnalysis): string {
  const parts = t.layers.map((l) => `${l.label} with ${l.carrier}, ${formatCurrency(l.attachment)} to ${formatCurrency(l.exhaustion)}`);
  const issues = t.findings.filter((f) => f.kind === "gap" || f.kind === "overlap").map((f) => f.message);
  return `Tower: ${parts.join("; ")}. ${issues.length ? issues.join(" ") : t.continuous ? "Continuous with no gaps or overlaps." : ""}`;
}
