"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { IMPORT_COLUMNS, checkImportColumns, validateImportRows, type ImportRowResult } from "@/lib/domain/lossRuns";
import { importClaims, type ImportResult } from "@/server/lossRuns/actions";

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  existingClaimNumbers: string[];
}

type Stage = { kind: "pick" } | { kind: "preview"; fileName: string; rows: Record<string, string>[]; results: ImportRowResult[] } | { kind: "done"; result: ImportResult };

export function ImportClaimsDialog({ slug, accountId, asOf, existingClaimNumbers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmReserve, setConfirmReserve] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStage({ kind: "pick" });
    setFileError(null);
    setConfirmReserve(false);
  }

  function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (out) => {
        const headers = out.meta.fields ?? [];
        const cols = checkImportColumns(headers).value;
        if (cols.missing.length > 0) {
          setFileError(`The file is missing these columns: ${cols.missing.join(", ")}. Download the template for the expected layout.`);
          return;
        }
        if (out.data.length === 0) {
          setFileError("The file has a header row but no claims.");
          return;
        }
        const results = validateImportRows(out.data, { asOf, existingClaimNumbers }).value;
        setStage({ kind: "preview", fileName: file.name, rows: out.data, results });
      },
      error: (err) => setFileError(`Could not read the file: ${err.message}`),
    });
  }

  function runImport() {
    if (stage.kind !== "preview") return;
    const rows = stage.rows;
    startTransition(async () => {
      const res = await importClaims(slug, accountId, rows, confirmReserve);
      if (!res.ok) {
        // Nothing was written: the insert is one transaction.
        toast.error(res.message, { description: "No claims were imported." });
        return;
      }
      setStage({ kind: "done", result: res.data });
      router.refresh();
    });
  }

  const preview = stage.kind === "preview" ? stage : null;
  const validCount = preview ? preview.results.filter((r) => r.valid).length : 0;
  const warnedCount = preview ? preview.results.filter((r) => r.valid && r.warnings.length > 0).length : 0;
  const toImport = validCount - (confirmReserve ? 0 : warnedCount);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <FileUp aria-hidden="true" />
          Import CSV
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href="/templates/loss-run-template.csv" download>
            <Download aria-hidden="true" />
            Template
          </a>
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import claims from CSV</DialogTitle>
            <DialogDescription>
              Columns, in any order: {IMPORT_COLUMNS.join(", ")}. Dates as YYYY-MM-DD. Only valid rows are imported, all in one go.
            </DialogDescription>
          </DialogHeader>

          {stage.kind === "pick" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="claims-file">Loss run file (.csv)</Label>
              <input
                id="claims-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onFile(e.target.files?.[0])}
                aria-describedby={fileError ? "claims-file-error" : undefined}
                className="native-control h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
              />
              {fileError ? (
                <p id="claims-file-error" role="alert" className="text-sm text-destructive">
                  {fileError}
                </p>
              ) : null}
            </div>
          ) : null}

          {preview ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm" role="status">
                {preview.fileName}: <strong>{validCount}</strong> of {preview.results.length} rows valid
                {preview.results.length - validCount > 0 ? `; ${preview.results.length - validCount} will be skipped` : ""}.
              </p>
              <div className="max-h-[45dvh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Claim</TableHead>
                      <TableHead>Line</TableHead>
                      <TableHead>Loss</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.results.map((r) => (
                      <TableRow key={r.row} className={r.valid ? undefined : "bg-destructive/5"}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell>{r.raw.claim_number || "—"}</TableCell>
                        <TableCell>{r.raw.line || "—"}</TableCell>
                        <TableCell>{r.raw.date_of_loss || "—"}</TableCell>
                        <TableCell>{r.raw.date_reported || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.paid || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.reserved || "—"}</TableCell>
                        <TableCell>{r.raw.status || "—"}</TableCell>
                        <TableCell className="min-w-56 whitespace-normal">
                          {r.valid ? <Badge variant="outline">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>}
                          {r.reasons.length > 0 ? <span className="mt-1 block text-xs text-destructive">{r.reasons.join("; ")}</span> : null}
                          {r.warnings.length > 0 ? <span className="mt-1 block text-xs text-amber-700">Warning: {r.warnings.join("; ")}</span> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {warnedCount > 0 ? (
                <NativeCheckbox
                  id="confirm-reserve-import"
                  label={`Import the ${warnedCount} closed ${warnedCount === 1 ? "claim that still carries" : "claims that still carry"} a reserve (reopened files)`}
                  checked={confirmReserve}
                  onChange={(e) => setConfirmReserve(e.target.checked)}
                />
              ) : null}
            </div>
          ) : null}

          {stage.kind === "done" ? (
            <div className="flex flex-col gap-3" role="status">
              <p className="text-base font-medium">
                Imported {stage.result.imported} of {stage.result.total} rows; {stage.result.skipped.length} skipped.
              </p>
              {stage.result.skipped.length > 0 ? (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-1 font-medium">Skipped rows</p>
                  <ul className="flex flex-col gap-1">
                    {stage.result.skipped.map((s) => (
                      <li key={s.row}>
                        Row {s.row}
                        {s.claimNumber ? ` (${s.claimNumber})` : ""}: {s.reasons.join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {stage.kind === "preview" ? (
              <>
                <Button type="button" variant="ghost" onClick={reset}>
                  Choose another file
                </Button>
                <Button type="button" onClick={runImport} disabled={toImport === 0 || pending}>
                  {pending ? "Importing…" : `Import ${toImport} valid ${toImport === 1 ? "row" : "rows"}`}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant={stage.kind === "done" ? "default" : "ghost"}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                {stage.kind === "done" ? "Done" : "Cancel"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
