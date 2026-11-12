import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/account/AccountForm";
import type { AccountFormInput } from "@/lib/schemas/account";
import { INDUSTRIES, PROVINCES, type Industry, type Province } from "@/lib/constants";
import { getAccountDetail } from "@/server/accounts/queries";
import { requireWorkspace } from "../../../lib";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: { params: Promise<{ slug: string; accountId: string }> }) {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  if (!detail) notFound();
  const a = detail.account;

  const defaults: AccountFormInput = {
    name: a.name,
    industry: (INDUSTRIES as readonly string[]).includes(a.industry) ? (a.industry as Industry) : "other",
    annualRevenue: a.annualRevenue === null ? "" : String(a.annualRevenue),
    employeeCount: a.employeeCount === null ? "" : String(a.employeeCount),
    province: (PROVINCES as readonly string[]).includes(a.province) ? (a.province as Province) : "ON",
    producer: a.producer ?? "",
    accountManager: a.accountManager ?? "",
    status: a.status,
    notes: a.notes ?? "",
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit {a.name}</h1>
        <p className="text-sm text-muted-foreground">Fields marked * are required.</p>
      </div>
      <AccountForm slug={slug} accountId={a.id} defaultValues={defaults} cancelHref={`/w/${slug}/accounts/${a.id}`} />
    </div>
  );
}
