"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/server/accounts/actions";

interface Props {
  slug: string;
  accountId: string;
  accountName: string;
  contactCount: number;
  policyCount: number;
  claimCount: number;
}

export function DeleteAccountButton({ slug, accountId, accountName, contactCount, policyCount, claimCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteAccount(slug, accountId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Deleted ${accountName}`);
      router.push(`/w/${slug}`);
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {accountName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This also deletes its {contactCount} {contactCount === 1 ? "contact" : "contacts"}, {policyCount} {policyCount === 1 ? "policy" : "policies"} and{" "}
            {claimCount} {claimCount === 1 ? "claim" : "claims"}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
