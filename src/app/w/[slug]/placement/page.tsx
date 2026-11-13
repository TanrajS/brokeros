import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ValueOrMissing } from "@/components/Missing";
import { titleCase } from "@/lib/format";
import { listPlacementAccounts } from "@/server/lossRuns/queries";
import { requireWorkspace } from "../lib";

export const metadata: Metadata = { title: "Placement" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PlacementPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const all = await listPlacementAccounts(ws.id);
  const rows = q ? all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())) : all;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Placement</h1>
        <p className="text-sm text-muted-foreground">Choose an account to work on its loss runs. Program, marketing and strategy follow in later versions.</p>
      </div>
      <form action={`/w/${slug}/placement`} method="get" role="search" className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="placement-search">Find an account</Label>
          <Input id="placement-search" name="q" defaultValue={q} className="w-64 max-w-full" />
        </div>
        <Button type="submit" variant="outline" aria-label="Search accounts">
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </form>
      {all.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No accounts yet. Add one in the{" "}
          <Link href={`/w/${slug}`} className="underline">
            Book
          </Link>{" "}
          or load the demo book in Settings.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">No accounts match &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Producer</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead className="text-right">Claims</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <Link href={`/w/${slug}/placement/${a.id}/loss-runs`} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>{titleCase(a.industry)}</TableCell>
                  <TableCell>
                    <ValueOrMissing text={a.producer} what="Producer" />
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">{a.lines.length ? a.lines.join(", ") : <ValueOrMissing text={null} what="Policies" />}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.claimCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
