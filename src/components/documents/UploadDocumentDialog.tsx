"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { ALLOWED_DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_SINGULAR, checkDocumentFile, type DocumentType } from "@/lib/domain/documents";
import { documentFormSchema, type DocumentFormInput, type DocumentFormValues } from "@/lib/schemas/document";
import { uploadDocument } from "@/server/documents/actions";

export interface PolicyChoice {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  folder: DocumentType;
  policyYears: string[];
  insurers: string[];
  policies: PolicyChoice[];
  /** Pre-select a policy (policy page). */
  policyId?: string | null;
  trigger?: React.ReactNode;
}

const ACCEPT = Object.keys(ALLOWED_DOCUMENT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

/** Upload a file into a folder with the folder's own fields; the server stores nothing unless file and fields both pass. */
export function UploadDocumentDialog({ slug, accountId, folder, policyYears, insurers, policies, policyId = null, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [marketDraft, setMarketDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError, setValue, control, reset } = useForm<DocumentFormInput, unknown, DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: { docType: folder, title: "", policyYear: policyYears[0] ?? "", status: folder === "proposal" ? "draft" : "", markets: [], policyId: policyId ?? "", notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof DocumentFormInput) => formState.errors[k]?.message;
  const watchedMarkets = useWatch({ control, name: "markets" });
  const markets = useMemo(() => watchedMarkets ?? [], [watchedMarkets]);
  const marketOptions = useMemo(() => insurers.filter((i) => !markets.includes(i)), [insurers, markets]);
  const fileCheck = file ? checkDocumentFile(file.name, file.size).value : null;

  function onFile(f: File | undefined) {
    setFile(f ?? null);
    setFileError(f ? (checkDocumentFile(f.name, f.size).value.reason ?? null) : null);
  }
  function addMarket(name: string) {
    const clean = name.trim();
    if (!clean || markets.includes(clean)) return;
    setValue("markets", [...markets, clean], { shouldValidate: true, shouldDirty: true });
    setMarketDraft("");
  }
  function removeMarket(name: string) {
    setValue("markets", markets.filter((m) => m !== name), { shouldValidate: true, shouldDirty: true });
  }

  function onSubmit() {
    if (!file || !fileCheck?.ok) {
      setFileError(fileCheck?.reason ?? "Choose a file");
      return;
    }
    const v = getValues();
    const form = new FormData();
    form.set("docType", v.docType);
    form.set("title", v.title);
    form.set("policyYear", v.policyYear);
    form.set("status", v.status ?? "");
    form.set("markets", JSON.stringify(v.markets));
    form.set("policyId", v.policyId);
    form.set("notes", v.notes);
    form.set("file", file);
    startTransition(async () => {
      const res = await uploadDocument(slug, accountId, form);
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          if (k === "file") setFileError(m);
          else setError(k as keyof DocumentFormInput, { message: m });
        }
        return;
      }
      toast.success(`${DOCUMENT_TYPE_SINGULAR[folder]} uploaded`);
      setOpen(false);
      reset();
      setFile(null);
      router.refresh();
    });
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger ?? (
          <Button type="button" size="sm">
            <Upload aria-hidden="true" />
            Upload {DOCUMENT_TYPE_SINGULAR[folder].toLowerCase()}
          </Button>
        )}
      </span>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            reset();
            setFile(null);
            setFileError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Upload to {DOCUMENT_TYPE_LABELS[folder]}</DialogTitle>
              <DialogDescription>PDF, Word, Excel, CSV, PNG or JPG up to 10 MB. This is a demo: upload only fictional documents.</DialogDescription>
            </DialogHeader>
            <input type="hidden" {...register("docType")} />
            <Field id="doc-file" label="File" required error={fileError ?? undefined} hint={file && fileCheck?.ok ? `${file.name}, ${(file.size / 1024).toFixed(0)} KB` : undefined}>
              <input id="doc-file" type="file" accept={ACCEPT} onChange={(e) => onFile(e.target.files?.[0])} aria-describedby={fileError ? "doc-file-error" : undefined} className="native-control h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm" />
            </Field>
            <Field id="doc-title" label="Title" required error={msg("title")}>
              <Input {...register("title")} {...fieldA11y("doc-title", msg("title"))} autoComplete="off" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="doc-year" label="Policy year" error={msg("policyYear")} hint="Choose one of the account's periods or type your own">
                <Input {...register("policyYear")} {...fieldA11y("doc-year", msg("policyYear"), "hint")} list="doc-years" autoComplete="off" />
                <datalist id="doc-years">
                  {policyYears.map((y) => (
                    <option key={y} value={y} />
                  ))}
                </datalist>
              </Field>
              {folder === "proposal" ? (
                <Field id="doc-status" label="Status" required error={msg("status")}>
                  <NativeSelect {...register("status")} {...fieldA11y("doc-status", msg("status"))}>
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                  </NativeSelect>
                </Field>
              ) : null}
              {folder === "policy_document" || folder === "certificate" ? (
                <Field id="doc-policy" label="Linked policy" error={msg("policyId")}>
                  <NativeSelect {...register("policyId")} {...fieldA11y("doc-policy", msg("policyId"))}>
                    <option value="">None</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
            </div>
            {folder === "submission" ? (
              <Field id="doc-markets" label="Markets" required error={msg("markets")} hint="Pick insurers already in the workspace, or type a new one and press Add">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {markets.map((m) => (
                      <Badge key={m} variant="secondary" className="gap-1">
                        {m}
                        <button type="button" aria-label={`Remove ${m}`} onClick={() => removeMarket(m)} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))}
                    {markets.length === 0 ? <span className="text-xs text-muted-foreground">No market selected yet</span> : null}
                  </div>
                  <div className="flex gap-2">
                    <Input id="doc-markets" value={marketDraft} onChange={(e) => setMarketDraft(e.target.value)} list="doc-market-list" placeholder="Insurer" autoComplete="off" onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMarket(marketDraft);
                      }
                    }} />
                    <datalist id="doc-market-list">
                      {marketOptions.map((i) => (
                        <option key={i} value={i} />
                      ))}
                    </datalist>
                    <Button type="button" variant="outline" onClick={() => addMarket(marketDraft)} disabled={!marketDraft.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              </Field>
            ) : null}
            <Field id="doc-notes" label="Notes" error={msg("notes")}>
              <Textarea {...register("notes")} {...fieldA11y("doc-notes", msg("notes"))} rows={2} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formState.isValid || !file || !fileCheck?.ok || pending}>
                {pending ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
