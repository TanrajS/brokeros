"use client";

import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies the workspace URL. Anyone with that link can view and edit the workspace. */
export function ShareLinkButton({ slug }: { slug: string }) {
  async function copy() {
    const url = `${window.location.origin}/w/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Anyone with this link can edit the workspace." });
    } catch {
      toast.info("Copy this link", { description: url, duration: 10000 });
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy share link">
      <Link2 aria-hidden="true" />
      <span className="hidden sm:inline">Share link</span>
    </Button>
  );
}
