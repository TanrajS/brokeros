"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { LAYER_TYPES, LINE_GROUP_LABELS, analyzeTower, type LineGroup, type TowerLayerInput } from "@/lib/domain/program";
import { parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency, formatRatioPercent } from "@/lib/format";
import { towerLayerFormSchema, type TowerLayerFormInput, type TowerLayerFormValues } from "@/lib/schemas/program";
import { deleteTowerLayer, saveTowerLayer } from "@/server/program/actions";
import { TowerDiagram } from "./TowerDiagram";

export interface LayerRow extends TowerLayerInput {
  policyId: string | null;
  /** Co-insurers on the linked policy, e.g. "Aurora 50% · Dominion 30% · Boreal 20%". */
  participants: string | null;
}

export interface LayerPolicyOption {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  lineGroup: LineGroup;
  layers: LayerRow[];
  policyOptions: LayerPolicyOption[];
}

type Editing = { mode: "create" } | { mode: "edit"; layer: LayerRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

export function TowerSection({ slug, accountId, lineGroup, layers, policyOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<LayerRow | null>(null);
  const analysis = useMemo(() => analyzeTower(layers), [layers]);
  const a = analysis.value;
  const byId = new Map(layers.map((l) => [l.id, l]));
  const findingFor = (id: string) => a.findings.filter((f) => f.layerId === id);

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteTowerLayer(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Layer removed");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="tower-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tower-heading" className="text-lg font-semibold">
          Tower: {LINE_GROUP_LABELS[lineGroup]}
        </h2>
        <Button type="button" size="sm" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add layer
        </Button>
      </div>

      {layers.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No layers yet. Add the primary first, then umbrella and excess layers above it.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={a.continuous ? "default" : "destructive"}>{a.continuous ? "Continuous" : "Not continuous"}</Badge>
            <span>
              Total limit: {a.totalLimit === null ? <Missing what="Total limit (tower is not continuous)" /> : formatCurrency(a.totalLimit)} · Top of tower:{" "}
              {a.topExhaustion === null ? "—" : formatCurrency(a.topExhaustion)}
            </span>
          </div>
          {a.findings.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {a.findings.map((f) => (
                <li key={`${f.kind}-${f.layerId}`} className={f.kind === "gap" || f.kind === "no_primary" ? "flex items-start gap-2 rounded-lg border border-red-600/40 bg-red-50 p-2 text-sm" : "flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-2 text-sm"}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <TowerDiagram analysis={a} />
            <div className="min-w-0 overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Layer</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead className="text-right">Attachment</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Exhaustion</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                    <TableHead className="text-right">Rate on line</TableHead>
                    <TableHead className="text-right">Per $1M</TableHead>
                    <TableHead className="text-right">vs primary</TableHead>
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...a.layers].reverse().map((l) => {
                    const row = byId.get(l.id)!;
                    const flags = findingFor(l.id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-medium">{l.label}</span>
                          <span className="block text-xs text-muted-foreground capitalize">{l.layerType}</span>
                          {flags.length > 0 ? (
                            <span className="mt-1 flex flex-col gap-1">
                              {flags.map((f) => (
                                <Badge key={f.kind} variant="outline" className={f.kind === "gap" ? "border-red-600 text-red-800" : f.kind === "overlap" ? "border-amber-600 text-amber-900" : "border-amber-500/60"}>
                                  {f.kind === "gap" ? `Gap ${formatCurrency(f.amount ?? 0)} below` : f.kind === "overlap" ? `Overlap ${formatCurrency(f.amount ?? 0)}` : f.kind === "rate_inversion" ? "Rate above layer below" : f.kind === "primary_not_at_zero" ? "Attaches above zero" : "No primary"}
                                </Badge>
                              ))}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="min-w-40 whitespace-normal">
                          {l.carrier}
                          {row.participants ? <span className="block text-xs text-muted-foreground">{row.participants}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.attachment)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.limit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.exhaustion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.premium)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.rateOnLine === null ? <Missing what="Rate on line (no limit)" /> : `${(l.rateOnLine * 100).toFixed(2)}%`}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.premiumPerMillion === null ? "—" : formatCurrency(l.premiumPerMillion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.relativeRate === null ? <Missing what="Relative rate (no primary rate)" /> : `${l.relativeRate.toFixed(3)}×`}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${l.label}`} onClick={() => setEditing({ mode: "edit", layer: row })}>
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${l.label}`} onClick={() => setDeleting(row)}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Rate on line = premium ÷ limit. A higher layer normally costs less per dollar of limit than the one below it. Relative rate = this layer&apos;s rate on line ÷ the primary&apos;s.
          </p>
          <ShowMath lines={analysis.math.steps.lines as string[]} />
        </>
      )}

      {editing ? (
        <LayerDialog
          key={editing.mode === "edit" ? editing.layer.id : "new"}
          slug={slug}
          accountId={accountId}
          lineGroup={lineGroup}
          editing={editing}
          others={layers}
          policyOptions={policyOptions}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this layer?</AlertDialogTitle>
            <AlertDialogDescription>The layer leaves the tower; the linked policy, if any, stays. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Removing…" : "Remove layer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function LayerDialog({
  slug,
  accountId,
  lineGroup,
  editing,
  others,
  policyOptions,
  onClose,
}: {
  slug: string;
  accountId: string;
  lineGroup: LineGroup;
  editing: NonNullable<Editing>;
  others: LayerRow[];
  policyOptions: LayerPolicyOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const l = editing.mode === "edit" ? editing.layer : null;
  const defaults: TowerLayerFormInput = l
    ? { lineGroup, layerType: l.layerType, carrier: l.carrier, attachment: str(l.attachment), limit: str(l.limit), premium: str(l.premium), policyId: l.policyId ?? "" }
    : { lineGroup, layerType: others.length === 0 ? "primary" : "umbrella", carrier: "", attachment: str(others.length ? Math.max(...others.map((o) => o.attachment + o.limit)) : 0), limit: "", premium: "", policyId: "" };
  const { register, handleSubmit, formState, getValues, setError, control } = useForm<TowerLayerFormInput, unknown, TowerLayerFormValues>({
    resolver: zodResolver(towerLayerFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof TowerLayerFormInput) => formState.errors[k]?.message;

  // Recompute the whole tower as the user types, so the effect of the change shows before saving.
  const draft = useWatch({ control });
  const preview = useMemo(() => {
    const attachment = parseCurrencyInput(draft.attachment ?? "").value;
    const limit = parseCurrencyInput(draft.limit ?? "").value;
    const premium = parseCurrencyInput(draft.premium ?? "").value;
    if (attachment === null || limit === null || limit <= 0 || premium === null) return null;
    const candidate: TowerLayerInput = { id: l?.id ?? "draft", layerType: draft.layerType ?? "umbrella", attachment, limit, premium, carrier: draft.carrier || "New layer" };
    return analyzeTower([...others.filter((o) => o.id !== candidate.id), candidate]).value;
  }, [draft, others, l?.id]);

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await saveTowerLayer(slug, accountId, l?.id ?? null, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof TowerLayerFormInput, { message });
        return;
      }
      toast.success(l ? "Layer saved" : "Layer added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{l ? "Edit layer" : "Add layer"}</DialogTitle>
            <DialogDescription>Attachment is where the layer starts; it exhausts at attachment + limit.</DialogDescription>
          </DialogHeader>
          <input type="hidden" {...register("lineGroup")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="layer-type" label="Layer type" required error={msg("layerType")}>
              <NativeSelect {...register("layerType")} {...fieldA11y("layer-type", msg("layerType"))}>
                {LAYER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="layer-carrier" label="Carrier" required error={msg("carrier")}>
              <Input {...register("carrier")} {...fieldA11y("layer-carrier", msg("carrier"))} autoComplete="off" />
            </Field>
            <Field id="layer-attachment" label="Attachment (CAD)" required error={msg("attachment")} hint="0 for a primary">
              <Input {...register("attachment")} {...fieldA11y("layer-attachment", msg("attachment"), "hint")} inputMode="decimal" />
            </Field>
            <Field id="layer-limit" label="Limit (CAD)" required error={msg("limit")}>
              <Input {...register("limit")} {...fieldA11y("layer-limit", msg("limit"))} inputMode="decimal" />
            </Field>
            <Field id="layer-premium" label="Premium (CAD)" required error={msg("premium")}>
              <Input {...register("premium")} {...fieldA11y("layer-premium", msg("premium"))} inputMode="decimal" />
            </Field>
            <Field id="layer-policy" label="Linked policy" error={msg("policyId")} hint="Optional; carries the policy's co-insurers into the tower">
              <NativeSelect {...register("policyId")} {...fieldA11y("layer-policy", msg("policyId"), "hint")}>
                <option value="">None</option>
                {policyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {preview ? (
            <div className="rounded-lg bg-muted/60 p-3 text-sm" aria-live="polite">
              <p className="font-medium">
                With this layer: {preview.continuous ? `continuous, total limit ${formatCurrency(preview.totalLimit ?? 0)}` : "not continuous"}
                {preview.layers.find((x) => x.id === (l?.id ?? "draft"))?.rateOnLine !== null
                  ? `; rate on line ${formatRatioPercent(preview.layers.find((x) => x.id === (l?.id ?? "draft"))!.rateOnLine)}`
                  : ""}
              </p>
              {preview.findings.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {preview.findings.map((f) => (
                    <li key={`${f.kind}-${f.layerId}`}>{f.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No gaps, overlaps or rate inversions.</p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save layer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
