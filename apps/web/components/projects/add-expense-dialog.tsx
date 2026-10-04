"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { useVendors } from "@/lib/api/hooks";
import { useCreateProjectExpense, useUpdateProjectExpense } from "@/lib/api/mutations";
import { toArray } from "@/lib/utils";

const CATEGORIES = [
  "SUBSCRIPTION",
  "RENT",
  "UTILITY",
  "TRAVEL",
  "SOFTWARE",
  "EQUIPMENT",
  "HOSTING",
  "MARKETING",
  "CONTRACTOR",
  "OTHER",
] as const;

export interface ExpenseRow {
  id: string;
  projectId?: string;
  description: string;
  category?: string;
  amount: number;
  incurredAt?: string;
  recurring?: boolean;
  recurrenceMonths?: number;
  notes?: string;
  vendorId?: string;
  vendor?: { id: string; name: string } | null;
}

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: ExpenseRow | null;
}

export function AddExpenseDialog({ projectId, open, onOpenChange, editing }: Props) {
  const vendors = useVendors();
  const create = useCreateProjectExpense();
  const update = useUpdateProjectExpense();

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [amount, setAmount] = useState<number | null>(null);
  const [incurredAt, setIncurredAt] = useState<Date | undefined>(new Date());
  const [recurring, setRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState<number | null>(1);
  const [vendorId, setVendorId] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description ?? "");
      setCategory(editing.category ?? "OTHER");
      setAmount(editing.amount != null ? Number(editing.amount) : null);
      setIncurredAt(editing.incurredAt ? new Date(editing.incurredAt) : new Date());
      setRecurring(!!editing.recurring);
      setRecurrenceMonths(editing.recurrenceMonths ?? 1);
      setVendorId(editing.vendorId ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setDescription("");
      setCategory("OTHER");
      setAmount(null);
      setIncurredAt(new Date());
      setRecurring(false);
      setRecurrenceMonths(1);
      setVendorId("");
      setNotes("");
    }
  }, [open, editing]);

  const canSubmit = !!description.trim() && amount != null && amount >= 0;
  const isPending = create.isPending || update.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const basePayload = {
      description: description.trim(),
      category,
      amount: Number(amount ?? 0),
      incurredAt: (incurredAt ?? new Date()).toISOString(),
      recurring,
      recurrenceMonths: recurring ? Math.max(1, Number(recurrenceMonths ?? 1)) : undefined,
      notes: notes.trim() || undefined,
      vendorId: vendorId || undefined,
    };

    if (editing) {
      // UpdateProjectExpenseDto rejects unknown fields — projectId isn't on
      // it (you can't move an expense to a different project via edit). Send
      // only the editable scalars.
      update.mutate(
        { id: editing.id, data: basePayload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      // Create needs the projectId FK on top of the editable scalars.
      create.mutate(
        { projectId, ...basePayload },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  // `/vendors` returns a paginated envelope `{ data: [...] }` on some responses
  // and a bare array on others — `toArray` handles both without crashing.
  const vendorOptions = [
    { value: "", label: "— No vendor —" },
    ...toArray<{ id: string; name?: string }>(vendors.data).map((v) => ({
      value: String(v.id),
      label: String(v.name ?? v.id),
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Log expense"}</DialogTitle>
          <DialogDescription>
            Track subscriptions, contractors, software, and other project costs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Figma team plan"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
              <Select
                value={category}
                onValueChange={setCategory}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
              <NumberInput value={amount} onChange={setAmount} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
              <DatePicker value={incurredAt ?? null} onChange={(d) => setIncurredAt(d)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Vendor</label>
              <Select
                value={vendorId}
                onValueChange={setVendorId}
                options={vendorOptions}
                placeholder="Select vendor"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Recurring expense
            </label>
            {recurring && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-slate-500">Every</span>
                <div className="w-24">
                  <NumberInput
                    value={recurrenceMonths}
                    onChange={setRecurrenceMonths}
                    placeholder="1"
                  />
                </div>
                <span className="text-xs text-slate-500">months</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            {isPending ? "Saving..." : editing ? "Save changes" : "Log expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
