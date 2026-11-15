import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { WorkspaceActions } from "@/components/settings/WorkspaceActions";
import { APP_VERSION } from "@/lib/constants";
import { countAccounts } from "@/server/workspace/queries";
import { requireWorkspace } from "../lib";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await requireWorkspace(slug);
  const accountCount = await countAccounts(ws.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>The name shown in the header and the date every calculation is based on.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm slug={slug} defaultValues={{ name: ws.name, asOfDate: ws.asOfDate }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Load sample data, export what you have, or start over.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceActions slug={slug} accountCount={accountCount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Broker OS {APP_VERSION}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>All sample data is fictional. Company names, carriers, people and emails are invented and do not refer to real insurers or businesses.</li>
            <li>
              Anyone with the link <code className="rounded bg-muted px-1 py-0.5 text-xs">/w/{slug}</code> can view and edit this workspace. There are no
              accounts or passwords.
            </li>
            <li>
              The app reads three environment variables: the database connection string, the Vercel Blob token that stores uploaded documents and generated
              certificates privately, and the cron secret that guards the nightly demo reset. There are no logins, payments, AI features or analytics.
            </li>
            <li>Uploaded files are not virus-scanned and sit on a free storage tier. Upload only fictional documents.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
