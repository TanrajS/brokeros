"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { ValueOrMissing } from "@/components/Missing";
import { contactFormSchema, emptyContactForm, type ContactFormInput, type ContactFormValues } from "@/lib/schemas/contact";
import { createContact, deleteContact, updateContact } from "@/server/contacts/actions";

export interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  slug: string;
  accountId: string;
  contacts: ContactRow[];
}

type Editing = { mode: "create" } | { mode: "edit"; contact: ContactRow } | null;

export function ContactsSection({ slug, accountId, contacts }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteContact(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Removed ${target.name}`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="contacts-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="contacts-heading" className="text-lg font-semibold">
          Contacts
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <ValueOrMissing text={c.role} what="Role" />
                  </TableCell>
                  <TableCell>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      <ValueOrMissing text={null} what="Email" />
                    )}
                  </TableCell>
                  <TableCell>
                    <ValueOrMissing text={c.phone} what="Phone" />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ mode: "edit", contact: c })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing ? (
        <ContactDialog
          key={editing.mode === "edit" ? editing.contact.id : "new"}
          slug={slug}
          accountId={accountId}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the contact from the account. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete contact"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ContactDialog({ slug, accountId, editing, onClose }: { slug: string; accountId: string; editing: NonNullable<Editing>; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaults: ContactFormInput =
    editing.mode === "edit"
      ? { name: editing.contact.name, role: editing.contact.role ?? "", email: editing.contact.email ?? "", phone: editing.contact.phone ?? "" }
      : emptyContactForm;
  const { register, handleSubmit, formState, getValues, setError } = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const errors = formState.errors;
  const msg = (k: keyof ContactFormInput) => errors[k]?.message;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = editing.mode === "edit" ? await updateContact(slug, editing.contact.id, raw) : await createContact(slug, accountId, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof ContactFormInput, { message });
        return;
      }
      toast.success(editing.mode === "edit" ? "Contact saved" : "Contact added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing.mode === "edit" ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          <Field id="contact-name" label="Name" required error={msg("name")}>
            <Input {...register("name")} {...fieldA11y("contact-name", msg("name"))} autoComplete="off" />
          </Field>
          <Field id="contact-role" label="Role" error={msg("role")}>
            <Input {...register("role")} {...fieldA11y("contact-role", msg("role"))} />
          </Field>
          <Field id="contact-email" label="Email" error={msg("email")}>
            <Input {...register("email")} {...fieldA11y("contact-email", msg("email"))} type="email" inputMode="email" />
          </Field>
          <Field id="contact-phone" label="Phone" error={msg("phone")}>
            <Input {...register("phone")} {...fieldA11y("contact-phone", msg("phone"))} type="tel" inputMode="tel" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
