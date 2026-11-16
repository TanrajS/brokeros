"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LineGroup } from "@/lib/domain/program";
import { exportProgramPdf } from "@/server/program/actions";

interface Props {
  slug: string;
  accountId: string;
  lineGroup: LineGroup;
  /** False when Vercel Blob is not configured or the group has no layers. */
  enabled: boolean;
  disabledReason?: string;
}

/**
 * Renders the Program summary PDF on the server, files it under Documents →
 * Policy documents and opens it in a new tab. The tab is opened on the click
 * itself (before the await) so pop-up blockers let it through.
 */
export function ExportProgramPdfButton({ slug, accountId, lineGroup, enabled, disabledReason }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onClick() {
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const res = await exportProgramPdf(slug, accountId, lineGroup);
      if (!res.ok) {
        tab?.close();
        toast.error(res.message);
        return;
      }
      const href = `/w/${slug}/documents/${res.data.documentId}`;
      if (tab) tab.location.href = href;
      else window.open(href, "_blank");
      toast.success("Program summary filed under Policy documents", { description: res.data.title });
      router.refresh();
    });
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick} disabled={!enabled || pending} title={enabled ? undefined : disabledReason}>
      <FileText aria-hidden="true" />
      {pending ? "Exporting…" : "Export PDF"}
    </Button>
  );
}
