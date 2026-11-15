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
import { PLACEMENT_COLUMNS, checkPlacementColumns, validatePlacementRows, type LineGroup, type PlacementRowResult } from "@/lib/domain/program";
import { importPlacementSchedule, type PlacementImportResult } from "@/server/program/actions";

interface Props {
  slug: string;
  accountId: string;
  lineGroup: LineGroup;
}

type Stage = { kind: "pick" } | { kind: "preview"; fileName: string; rows: Record<string, string>[]; results: PlacementRowResult[] } | { kind: "done"; result: PlacementImportResult };

/** Import a placement schedule CSV (one row per insurer line) with the preview-and-validate flow. */
export function ImportPlacementDialog({ slug, accountId, lineGroup }: Props) {
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
        const cols = checkPlacementColumns(out.meta.fields ?? []).value;
        if (cols.missing.length > 0) {
          setFileError(`The file is missing these columns: ${cols.missing.join(", ")}.`);
          return;
        }
        if (out.data.length === 0) {
          setFileError("The file has a header row but no lines.");
          return;
        }
        setStage({ kind: "preview", fileName: file.name, rows: out.data, results: validatePlacementRows(out.data).value });
      },
      error: (err) => setFileError(`Could not read the file: ${err.message}`),
    });
  }

  function runImport() {
    if (stage.kind !== "preview") return;
    const rows = stage.rows;
    startTransition(async () => {
      const res = await importPlacementSchedule(slug, accountId, lineGroup, rows);
      if (!res.ok) {
        toast.error(res.message, { description: "Nothing was imported." });
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
        Import schedule (CSV)
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import a placement schedule</DialogTitle>
            <DialogDescription>
              One row per insurer line. Columns, in any order: {PLACEMENT_COLUMNS.join(", ")}. Rows with the same tower, layer type, attachment and limit share one layer. Percentages 0–100; signed not
              above written; the same insurer twice in a layer is rejected.
            </DialogDescription>
          </DialogHeader>
          {stage.kind === "pick" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="placement-file">Schedule file (.csv)</Label>
              <input
                id="placement-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onFile(e.target.files?.[0])}
                aria-describedby={fileError ? "placement-file-error" : undefined}
                className="native-control h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
              />
              {fileError ? (
                <p id="placement-file-error" role="alert" className="text-sm text-destructive">
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
                      <TableHead>Tower</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Attachment</TableHead>
                      <TableHead className="text-right">Limit</TableHead>
                      <TableHead>Insurer</TableHead>
                      <TableHead className="text-right">Written</TableHead>
                      <TableHead className="text-right">Signed</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.results.map((r) => (
                      <TableRow key={r.row} className={r.valid ? undefined : "bg-destructive/5"}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell>{r.raw.tower || "Tower 1"}</TableCell>
                        <TableCell>{r.raw.layer_type || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.attachment || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.limit || "—"}</TableCell>
                        <TableCell>{r.raw.insurer || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.written_line_pct || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.signed_line_pct || "—"}</TableCell>
                        <TableCell className="text-right">{r.raw.premium || "—"}</TableCell>
                        <TableCell className="min-w-48 whitespace-normal">
                          {r.valid ? <Badge variant="outline">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>}
                          {r.reasons.length > 0 ? <span className="mt-1 block text-xs text-destructive">{r.reasons.join("; ")}</span> : null}
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
                Added {stage.result.participationsAdded} insurer line{stage.result.participationsAdded === 1 ? "" : "s"} on {stage.result.layersCreated} new layer{stage.result.layersCreated === 1 ? "" : "s"}; {stage.result.skipped.length} of {stage.result.total} rows skipped.
              </p>
              {stage.result.skipped.length > 0 ? (
                <ul className="rounded-lg border p-3 text-sm">
                  {stage.result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}
                      {s.insurer ? ` (${s.insurer})` : ""}: {s.reasons.join("; ")}
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
