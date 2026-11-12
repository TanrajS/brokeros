import type { Metadata } from "next";
import { AccountForm } from "@/components/account/AccountForm";
import { emptyAccountForm } from "@/lib/schemas/account";
import { requireWorkspace } from "../../lib";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireWorkspace(slug);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New account</h1>
        <p className="text-sm text-muted-foreground">Fields marked * are required.</p>
      </div>
      <AccountForm slug={slug} defaultValues={emptyAccountForm} cancelHref={`/w/${slug}`} />
    </div>
  );
}
