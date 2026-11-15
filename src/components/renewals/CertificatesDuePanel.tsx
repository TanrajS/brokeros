import Link from "next/link";
import { FileWarning } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CertificateDue } from "@/server/program/queries";
import { formatDate } from "@/lib/format";

/** Certificates whose underlying policy expired or was renewed since issuance, so a new certificate must go to the holder. */
export function CertificatesDuePanel({ slug, rows }: { slug: string; rows: CertificateDue[] }) {
  return (
    <section aria-labelledby="certs-due-heading" className="flex flex-col gap-3">
      <h2 id="certs-due-heading" className="flex items-center gap-2 text-lg font-semibold">
        <FileWarning className="size-5" aria-hidden="true" />
        Certificates due
        <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No certificates need reissue. A certificate lands here once an underlying policy expires or a renewal is recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Coverages</TableHead>
                <TableHead>Issued on</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.certificate.id}>
                  <TableCell className="font-medium">
                    <Link href={`/w/${slug}/accounts/${r.accountId}/program`} className="hover:underline">
                      {r.accountName}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal">{r.certificate.holder}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal text-xs">{r.certificate.coverages.join(", ")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.certificate.issuedOn ? formatDate(r.certificate.issuedOn) : "—"}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal text-xs text-muted-foreground">{r.reasons.join("; ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
