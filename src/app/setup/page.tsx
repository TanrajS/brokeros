import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkDatabase } from "@/server/workspace/queries";

export const metadata: Metadata = { title: "Set up the database" };

export default function SetupPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Broker OS needs a database</h1>
        <Suspense fallback={<p className="mt-2 text-muted-foreground" role="status">Checking the database connection…</p>}>
          <StatusLine />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Get a Neon Postgres connection string</CardTitle>
          <CardDescription>Create a free project at neon.tech, open Connect, and copy the connection string.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Put it in .env.local</CardTitle>
          <CardDescription>Copy .env.example to .env.local and paste the string. This is the only secret the app uses.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            <code>{`DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"`}</code>
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Create the tables and restart</CardTitle>
          <CardDescription>Run the migrations, optionally seed a demo book, then restart the dev server.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            <code>{`npm run db:migrate\nnpm run db:seed   # optional\nnpm run dev`}</code>
          </pre>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <StatusDetail />
      </Suspense>

      <div>
        <Button asChild>
          <Link href="/" prefetch={false}>
            Open Broker OS
          </Link>
        </Button>
      </div>
    </main>
  );
}

/** Request-time only: the connection check must never be baked into a build. */
async function StatusLine() {
  await connection();
  const status = await checkDatabase();
  return (
    <p className="mt-2 text-muted-foreground">
      {status.ok
        ? "The database is reachable. You're all set."
        : status.reason === "missing"
          ? "DATABASE_URL is not set, so the app cannot store workspaces yet."
          : "DATABASE_URL is set, but the database could not be reached."}
    </p>
  );
}

async function StatusDetail() {
  await connection();
  const status = await checkDatabase();
  if (status.ok || status.reason !== "unreachable" || !status.detail) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>What the database said</CardTitle>
        <CardDescription>Common causes: a typo in the string, a paused Neon project, or migrations not yet applied.</CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
          <code>{status.detail}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
