import { NextResponse } from "next/server";
import { connection } from "next/server";
import { parseStrategyQuery } from "@/components/strategy/params";
import { APP_VERSION } from "@/lib/constants";
import { buildStrategyView } from "@/server/strategy/view";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** Every input behind the renewal strategy report, as JSON, for audit. Read-only. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; accountId: string }> }) {
  await connection();
  const { slug, accountId } = await params;
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
    const view = await buildStrategyView(ws, accountId, parseStrategyQuery(sp));
    if (!view) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (!view.policy) return NextResponse.json({ error: "No policy in renewal on this account" }, { status: 404 });
    const { policy, data } = view;
    const payload = {
      format: "brokeros-strategy-report",
      version: APP_VERSION,
      workspace: { id: ws.id, slug: ws.slug, name: ws.name, asOfDate: ws.asOfDate },
      account: data.account,
      policy,
      line: view.line,
      settings: view.replay,
      claimsByPolicyYear: view.grouped.value,
      retentionOptions: view.policyOptions,
      optionRows: view.optionRows,
      premiumSource: view.premiumSource,
      tolerances: view.tolerances,
      findings: view.findings?.value ?? null,
      findingsMath: view.findings?.math ?? null,
      acceptedFindings: [...view.accepted],
      analysis: view.analysis.value,
      analysisMath: view.analysis.math,
      inForcePolicies: view.inForce,
      otherLines: view.otherLines,
      totalCostOfRisk: view.tcorByOption.map((t) => ({ value: t.value, math: t.math })),
      considerations: view.considerations.value,
      programLayers: view.groupLayers,
      tiv: view.tiv,
      deductibleSchedule: view.schedule,
      missing: view.missing,
      assumptionsAndLimitations: view.assumptions.value,
      claims: data.claims,
      policies: data.lrPolicies,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="brokeros-strategy-${slug}-${accountId.slice(0, 8)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[brokeros] strategy export failed:", err);
    return NextResponse.json({ error: "Export failed. Check the database connection." }, { status: 500 });
  }
}
