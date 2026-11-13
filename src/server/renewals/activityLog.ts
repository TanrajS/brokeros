import "server-only";
import type { ActivityKind } from "@/lib/constants";
import { activities } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";

export interface ActivityEntry {
  workspaceId: string;
  accountId: string;
  policyId: string | null;
  kind: ActivityKind;
  body: string;
  asOfDate: string;
}

export async function logActivities(db: Executor, entries: ActivityEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(activities).values(entries);
}

/** "General Liability · Northgate Mutual" */
export function policyLabel(p: { lineOfBusiness: string; carrier: string }): string {
  return `${p.lineOfBusiness} · ${p.carrier}`;
}
