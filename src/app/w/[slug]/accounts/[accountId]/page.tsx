import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ValueOrMissing } from "@/components/Missing";
import { ContactsSection } from "@/components/account/ContactsSection";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { PoliciesTable } from "@/components/account/PoliciesTable";
import { ActivitySection } from "@/components/activity/ActivitySection";
import { TasksSection } from "@/components/tasks/TasksSection";
import { formatDate } from "@/lib/format";
import { listAccountActivities, listAccountTasks } from "@/server/renewals/queries";
import { ACCOUNT_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatInteger, titleCase } from "@/lib/format";
import { getAccountDetail } from "@/server/accounts/queries";
import { requireWorkspace } from "../../lib";

type Params = Promise<{ slug: string; accountId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  return { title: detail?.account.name ?? "Account" };
}

export default async function AccountPage({ params }: { params: Params }) {
  const { slug, accountId } = await params;
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  if (!detail) notFound();
  const { account, contacts, policies } = detail;
  const [tasks, activities] = await Promise.all([listAccountTasks(ws.id, account.id), listAccountActivities(ws.id, account.id)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={`/w/${slug}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to book
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{titleCase(account.industry)}</span>
              <span aria-hidden="true">·</span>
              <span>{account.province}</span>
              <Badge variant={account.status === "active" ? "default" : "secondary"}>{ACCOUNT_STATUS_LABELS[account.status]}</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/w/${slug}/accounts/${account.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <DeleteAccountButton slug={slug} accountId={account.id} accountName={account.name} contactCount={contacts.length} policyCount={policies.length} />
          </div>
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Annual revenue">
              <ValueOrMissing text={formatCurrency(account.annualRevenue)} what="Annual revenue" />
            </Detail>
            <Detail label="Employees">
              <ValueOrMissing text={formatInteger(account.employeeCount)} what="Employee count" />
            </Detail>
            <Detail label="Producer">
              <ValueOrMissing text={account.producer} what="Producer" />
            </Detail>
            <Detail label="Account manager">
              <ValueOrMissing text={account.accountManager} what="Account manager" />
            </Detail>
            <div className="sm:col-span-2 lg:col-span-4">
              <Detail label="Notes">
                {account.notes ? <span className="whitespace-pre-line">{account.notes}</span> : <ValueOrMissing text={null} what="Notes" />}
              </Detail>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ContactsSection slug={slug} accountId={account.id} contacts={contacts} />
      <PoliciesTable slug={slug} accountId={account.id} asOf={ws.asOfDate} policies={policies} />
      <TasksSection
        slug={slug}
        accountId={account.id}
        asOf={ws.asOfDate}
        defaultOwner={account.accountManager ?? account.producer}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, owner: t.owner, done: t.done, policyId: t.policyId }))}
        policyOptions={policies.map((p) => ({ id: p.id, label: `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}` }))}
      />
      <ActivitySection
        slug={slug}
        accountId={account.id}
        activities={activities.map((a) => ({ id: a.id, kind: a.kind, body: a.body, asOfDate: a.asOfDate }))}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
