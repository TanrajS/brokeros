"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileBadge } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { certificateContent, type CertificateInsurer, type CertificatePolicyInput } from "@/lib/domain/certificates";
import { certificateFormSchema, type CertificateFormInput, type CertificateFormValues } from "@/lib/schemas/document";
import { generateCertificate } from "@/server/certificates/actions";
import { DocumentsFolder, type DocumentRowView } from "@/components/documents/DocumentsFolder";

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  namedInsured: { name: string; province: string; industry: string };
  policy: CertificatePolicyInput;
  insurers: CertificateInsurer[];
  /** The account's other in-force policies, offered as additional coverage rows. */
  otherPolicies: CertificatePolicyInput[];
  certificates: DocumentRowView[];
  blobReady: boolean;
}

/** Generate a Certificate of Insurance for this policy's term, with a live preview of the same content the PDF will carry. */
export function CertificatesPanel({ slug, accountId, asOf, namedInsured, policy, insurers, otherPolicies, certificates, blobReady }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const { register, handleSubmit, formState, getValues, setError, control, setValue, reset } = useForm<CertificateFormInput, unknown, CertificateFormValues>({
    resolver: zodResolver(certificateFormSchema),
    defaultValues: { holderName: "", holderAddress: "", operations: "", includePolicyIds: [] },
    mode: "onChange",
  });
  const msg = (k: keyof CertificateFormInput) => formState.errors[k]?.message;
  const draft = useWatch({ control });
  const included = useMemo(() => otherPolicies.filter((p) => (draft.includePolicyIds ?? []).includes(p.id)), [draft.includePolicyIds, otherPolicies]);
  const preview = useMemo(
    () => certificateContent({ namedInsured, holder: { name: draft.holderName?.trim() || "Certificate holder", address: draft.holderAddress?.trim() || "Address" }, operations: draft.operations?.trim() || "Description of operations", issueDate: asOf, policy, insurers, included }).value,
    [draft.holderName, draft.holderAddress, draft.operations, included, namedInsured, asOf, policy, insurers],
  );

  function toggle(id: string, on: boolean) {
    const current = getValues("includePolicyIds") ?? [];
    setValue("includePolicyIds", on ? [...new Set([...current, id])] : current.filter((x) => x !== id), { shouldValidate: true, shouldDirty: true });
  }
  function onSubmit() {
    startTransition(async () => {
      const res = await generateCertificate(slug, policy.id, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof CertificateFormInput, { message: m });
        return;
      }
      toast.success("Certificate generated and filed", { description: "It is listed below and in the account's Certificates folder." });
      reset();
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="certificates-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="certificates-heading" className="text-lg font-semibold">
          Certificates of insurance
        </h2>
        <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)} disabled={!blobReady} title={blobReady ? undefined : "Documents are not configured (BLOB_READ_WRITE_TOKEN)"}>
          <FileBadge aria-hidden="true" />
          {showForm ? "Close" : "Generate certificate"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A certificate summarises this policy&apos;s current term for a holder. It is informational and confers no rights beyond the policies; it is flagged for reissue once the policy renews or expires. Holder
        details in this demo must be fictional.
      </p>
      {showForm ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Certificate inputs" className="flex flex-col gap-3 rounded-lg border p-4">
            <Field id="coi-holder" label="Certificate holder (fictional)" required error={msg("holderName")}>
              <Input {...register("holderName")} {...fieldA11y("coi-holder", msg("holderName"))} autoComplete="off" />
            </Field>
            <Field id="coi-address" label="Holder address" required error={msg("holderAddress")}>
              <Textarea {...register("holderAddress")} {...fieldA11y("coi-address", msg("holderAddress"))} rows={3} />
            </Field>
            <Field id="coi-ops" label="Description of operations" required error={msg("operations")}>
              <Textarea {...register("operations")} {...fieldA11y("coi-ops", msg("operations"))} rows={3} />
            </Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Also show these in-force policies</legend>
              {otherPolicies.length === 0 ? <p className="text-xs text-muted-foreground">No other in-force policies on the account.</p> : null}
              {otherPolicies.map((p) => (
                <NativeCheckbox key={p.id} id={`coi-inc-${p.id}`} label={`${p.lineOfBusiness} · ${p.carrier} · ${p.effectiveDate} to ${p.expiryDate}`} checked={(draft.includePolicyIds ?? []).includes(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
              ))}
              {msg("includePolicyIds") ? (
                <p className="text-xs text-destructive" role="alert">
                  {msg("includePolicyIds")}
                </p>
              ) : null}
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" disabled={!formState.isValid || pending}>
                {pending ? "Generating…" : "Generate PDF and file it"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>

          <figure aria-label="Certificate preview" className="flex flex-col gap-3 rounded-lg border bg-background p-5 text-sm shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-primary pb-2">
              <div>
                <p className="text-lg font-semibold">{preview.title}</p>
                <p className="text-xs text-muted-foreground">Broker OS · informational summary of coverage</p>
              </div>
              <div className="text-right text-xs">
                <p>Reference {preview.reference}</p>
                <p className="text-muted-foreground">Issued {preview.issueDate}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border p-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Named insured</p>
                {preview.namedInsured.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
              <div className="rounded border p-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Certificate holder</p>
                {preview.holder.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Description of operations</p>
              <p>{preview.operations}</p>
            </div>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 rounded border p-2 text-xs">
              {preview.policyRows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
              <dt className="text-muted-foreground">Endorsements present</dt>
              <dd>{preview.endorsementsPresent.length ? preview.endorsementsPresent.join("; ") : "None of the tracked endorsements"}</dd>
              {preview.endorsementsAbsent.length ? (
                <>
                  <dt className="text-muted-foreground">Not included</dt>
                  <dd className="text-muted-foreground">{preview.endorsementsAbsent.join("; ")}</dd>
                </>
              ) : null}
            </dl>
            {preview.insurers.length > 1 ? (
              <div className="text-xs">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Subscribing insurers and signed lines</p>
                {preview.insurers.map((x) => (
                  <p key={x.name}>
                    {x.name}: {x.signedLinePct}%
                  </p>
                ))}
              </div>
            ) : null}
            {preview.includedRows.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-2 py-1 font-medium">Also in force</th>
                    <th className="px-2 py-1 font-medium">Insurer</th>
                    <th className="px-2 py-1 font-medium">Period</th>
                    <th className="px-2 py-1 font-medium">Limits</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.includedRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{r.line}</td>
                      <td className="px-2 py-1">{r.insurer}</td>
                      <td className="px-2 py-1">{r.period}</td>
                      <td className="px-2 py-1">{r.limits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <p className="rounded bg-muted/40 p-2 text-xs">{preview.statement}</p>
            <figcaption className="text-xs text-muted-foreground">Preview of the PDF that will be generated. All parties in this demo are fictional.</figcaption>
          </figure>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          Certificates issued on this policy{" "}
          {certificates.some((c) => c.reissueNeeded) ? (
            <Badge variant="destructive" className="ml-1">
              Reissue needed
            </Badge>
          ) : null}
        </h3>
        <DocumentsFolder slug={slug} accountId={accountId} folder="certificate" rows={certificates} policyYears={[]} insurers={[]} policies={[]} canUpload={false} emptyText="No certificate has been generated for this policy yet." />
      </div>
    </section>
  );
}
