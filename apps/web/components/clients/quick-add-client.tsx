"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateClient } from "@/lib/api/mutations";

interface QuickAddClientButtonProps {
  /** Called with the newly created client's id so the parent can select it. */
  onCreated: (clientId: string) => void;
}

/**
 * Small inline button that opens a dialog to create a client on the fly,
 * without leaving the current document-builder page. Used next to the
 * Client select in estimates / invoices / credit-notes / recurring forms.
 */
export function QuickAddClientButton({ onCreated }: QuickAddClientButtonProps) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const create = useCreateClient();

  const reset = () => {
    setCompanyName(""); setContactPerson(""); setEmail(""); setPhone(""); setAddress("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || create.isPending) return;
    create.mutate(
      {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      },
      {
        onSuccess: (data: unknown) => {
          // apiPost returns the created client row; auto-select it.
          const created = data as { id?: string } | null;
          if (created?.id) onCreated(created.id);
          reset();
          setOpen(false);
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:underline"
      >
        <Plus className="size-3" /> New client
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quick add client</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <FormField label="Company name" required>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Health Labs"
                autoFocus
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Contact person">
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Nina Shah"
                />
              </FormField>
              <FormField label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nina@acme.com"
                />
              </FormField>
            </div>
            <FormField label="Phone">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9999999999"
              />
            </FormField>
            <FormField label="Address">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Bengaluru, India"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || !companyName.trim()}>
                {create.isPending ? "Creating…" : "Create & select"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
