"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Field, fieldA11y } from "@/components/form/Field";
import { RESET_CONFIRMATION } from "@/lib/schemas/workspace";
import { loadDemoBookAction, newWorkspaceFromDemo, resetWorkspace } from "@/server/workspace/actions";

export function WorkspaceActions({ slug, accountCount }: { slug: string; accountCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetError, setResetError] = useState<string | undefined>();

  function runLoadDemo(replace: boolean) {
    startTransition(async () => {
      const res = await loadDemoBookAction(slug, { replace });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setConfirmReplace(false);
      toast.success("Demo book loaded", { description: `${res.data.accounts} accounts and ${res.data.policies} policies, all fictional.` });
      router.refresh();
    });
  }

  function onLoadDemo() {
    if (accountCount > 0) setConfirmReplace(true);
    else runLoadDemo(false);
  }

  function onNewFromDemo() {
    startTransition(async () => {
      const res = await newWorkspaceFromDemo();
      // On success the action redirects, so only failures reach here.
      if (res && !res.ok) toast.error(res.message);
    });
  }

  function onReset() {
    startTransition(async () => {
      const res = await resetWorkspace(slug, confirmation);
      if (!res.ok) {
        setResetError(res.fieldErrors?.confirmation ?? res.message);
        if (!res.fieldErrors) toast.error(res.message);
        return;
      }
      setResetOpen(false);
      setConfirmation("");
      toast.success("Workspace reset", { description: "All accounts, contacts and policies were removed." });
      router.refresh();
    });
  }

  const exportBase = `/w/${slug}/export`;

  return (
    <div className="flex flex-col gap-6">
      <ActionRow
        title="Load demo book"
        description={
          accountCount > 0
            ? `Replace the ${accountCount} ${accountCount === 1 ? "account" : "accounts"} in this workspace with the fictional demo book.`
            : "Fill this empty workspace with 14 fictional accounts and about 45 policies."
        }
      >
        <Button type="button" variant="outline" onClick={onLoadDemo} disabled={pending}>
          <Sparkles aria-hidden="true" />
          Load demo book
        </Button>
      </ActionRow>

      <ActionRow title="New workspace from demo" description="Create a separate, freshly seeded workspace and switch to it. This one stays as it is.">
        <Button type="button" variant="outline" onClick={onNewFromDemo} disabled={pending}>
          <Sparkles aria-hidden="true" />
          New workspace from demo
        </Button>
      </ActionRow>

      <ActionRow title="Export" description="Download everything in this workspace. Exports are plain files you can keep or share.">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`${exportBase}/json`} download>
              <Download aria-hidden="true" />
              Export JSON
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${exportBase}/csv?type=accounts`} download>
              <Download aria-hidden="true" />
              Accounts CSV
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${exportBase}/csv?type=policies`} download>
              <Download aria-hidden="true" />
              Policies CSV
            </a>
          </Button>
        </div>
      </ActionRow>

      <ActionRow title="Reset this workspace" description="Delete every account, contact and policy. The workspace, its name, link and as-of date stay.">
        <Button type="button" variant="destructive" onClick={() => setResetOpen(true)} disabled={pending}>
          <Trash2 aria-hidden="true" />
          Reset this workspace
        </Button>
      </ActionRow>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing data?</AlertDialogTitle>
            <AlertDialogDescription>
              This workspace already has {accountCount} {accountCount === 1 ? "account" : "accounts"}. Loading the demo book deletes them, along
              with their contacts and policies, before adding the demo data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runLoadDemo(true)} disabled={pending}>
              <RotateCcw aria-hidden="true" />
              {pending ? "Loading…" : "Replace with demo book"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) {
            setConfirmation("");
            setResetError(undefined);
          }
        }}
      >
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onReset();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Reset this workspace?</DialogTitle>
              <DialogDescription>
                Every account, contact and policy will be deleted. Type <strong>{RESET_CONFIRMATION}</strong> to confirm.
              </DialogDescription>
            </DialogHeader>
            <Field id="reset-confirmation" label={`Type ${RESET_CONFIRMATION}`} required error={resetError}>
              <Input
                {...fieldA11y("reset-confirmation", resetError)}
                value={confirmation}
                onChange={(e) => {
                  setConfirmation(e.target.value);
                  setResetError(undefined);
                }}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={confirmation !== RESET_CONFIRMATION || pending}>
                {pending ? "Resetting…" : "Reset workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="max-w-md">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
