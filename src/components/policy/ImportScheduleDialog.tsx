"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { SCHEDULE_COLUMNS, checkScheduleColumns, validateScheduleRows, type ScheduleRowResult } from "@/lib/domain/deductibles";
import { importDeductibleSchedule, type ScheduleImportResult } from "@/server/deductibles/actions";

interface Props {
  slug: string;
  policyId: string;
  existingAppliesTo: string[];
}

type Stage = { kind: "pick" } | { kind: "preview"; fileName: string; rows: Record<string, string>[]; results: ScheduleRowResult[] } | { kind: "done"; result: ScheduleImportResult };

/** Import a deductible schedule CSV with the standard preview-and-validate flow. */
export function ImportScheduleDialog({ slug, policyId, existingAppliesTo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStage({ kind: "pick" });
    setFileError(null);
  }

  function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (out) => {
        const cols = checkScheduleColumns(out.meta.fields ?? []).value;
        if (cols.missing.length > 0) {
          setFileError(`The file is missing these columns: ${cols.missing.join(", ")}.`);
          return;
        }
        if (out.data.length === 0) {
          setFileError("The file has a header row but no rules.");
          return;
        }
        setStage({ kind: "preview", fileName: file.name, rows: out.data, results: validateScheduleRows(out.data, { existingAppliesTo }).value });
      },
      error: (err) => setFileError(`Could not read the file: ${err.message}`),
    });
  }

  function runImport() {
    if (stage.kind !== "preview") return;
    const rows = stage.rows;
    startTransition(async () => {
      const res = await importDeductibleSchedule(slug, policyId, rows);
      if (!res.ok) {
        toast.error(res.message, { description: "No rules were imported." });
        return;
      }
      setStage({ kind: "done", result: res.data });
      router.refresh();
    });
  }

  const preview = stage.kind === "preview" ? stage : null;
  const validCount = preview ? preview.results.filter((r) => r.valid).length : 0;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp aria-hidden="true" />
        Import schedule CSV
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import a deductible schedule</DialogTitle>
            <DialogDescription>
              Columns, in any order: {SCHEDULE_COLUMNS.join(", ")}. Kind is flat, percent_of_loss, percent_of_value or waiting_period; a flat rule needs an amount, a percent rule a percent, a waiting
              period hours. Only valid rows are imported, all in one go.
            </DialogDescription>
          </DialogHeader>
          {stage.kind === "pick" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-file">Schedule file (.csv)</Label>
              <input
                id="schedule-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onFile(e.target.files?.[0])}
                aria-describedby={fileError ? "schedule-file-error" : undefined}
                className="native-control h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
              />
              {fileError ? (
                <p id="schedule-file-error" role="alert" className="text-sm text-destructive">
                  {fileError}
                </p>
              ) : null}
            </div>
          ) : null}
          {preview ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm" role="status">
                {preview.fileName}: <strong>{validCount}</strong> of {preview.results.length} rows valid{preview.results.length - validCount > 0 ? `; ${preview.results.length - validCount} will be skipped` : ""}.
              </p>
              <div className="max-h-[45dvh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Applies to</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Percent</TableHead>
                      <TableHead>Min / max</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.results.map((r) => (
                      <TableRow key={r.row} className={r.valid ? undefined : "bg-destructive/5"}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell>{r.raw.applies_to || "—"}</TableCell>
                        <TableCell>{r.raw.kind || "—"}</TableCell>
                        <TableCell>{r.raw.amount || "—"}</TableCell>
                        <TableCell>{r.raw.percent || "—"}</TableCell>
                        <TableCell>
                          {r.raw.minimum || "—"} / {r.raw.maximum || "—"}
                        </TableCell>
                        <TableCell>{r.raw.hours || "—"}</TableCell>
                        <TableCell className="min-w-48 whitespace-normal">
                          {r.valid ? <Badge variant="outline">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>}
                          {r.reasons.length > 0 ? <span className="mt-1 block text-xs text-destructive">{r.reasons.join("; ")}</span> : null}
                          {r.warnings.length > 0 ? <span className="mt-1 block text-xs text-amber-700">Warning: {r.warnings.join("; ")}</span> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {stage.kind === "done" ? (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-base font-medium">
                Imported {stage.result.imported} of {stage.result.total} rows; {stage.result.skipped.length} skipped.
              </p>
              {stage.result.skipped.length > 0 ? (
                <ul className="rounded-lg border p-3 text-sm">
                  {stage.result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}
                      {s.appliesTo ? ` (${s.appliesTo})` : ""}: {s.reasons.join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {stage.kind === "preview" ? (
              <>
                <Button type="button" variant="ghost" onClick={reset}>
                  Choose another file
                </Button>
                <Button type="button" onClick={runImport} disabled={validCount === 0 || pending}>
                  {pending ? "Importing…" : `Import ${validCount} valid ${validCount === 1 ? "row" : "rows"}`}
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
