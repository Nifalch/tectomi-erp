"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { useCreateInvoice } from "@/lib/api/mutations";
import { useClients, useProjects } from "@/lib/api/hooks";
import { toArray } from "@/lib/utils";

interface LineItem {
  description: string;
  duration?: string;
  quantity: number;
  unitPrice: number;
}

const schema = z.object({
  clientId: z.string().min(1, "Client is required"),
  projectId: z.string().optional(),
  dueDate: z.date({ error: "Due date required" }),
  tax: z.number().optional(),
});
type FormValues = z.infer<typeof schema>;

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange }: CreateInvoiceDialogProps) {
  const createMutation = useCreateInvoice();
  const clientsQuery = useClients();
  const projectsQuery = useProjects();
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [leadNote, setLeadNote] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");

  const clients = toArray<{ id: string; companyName: string }>(clientsQuery.data);
  const projects = toArray<{ id: string; name: string; budget?: number | string }>(projectsQuery.data);

  const addItem = () => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  // Stage presets: pick a stage → auto-fills the first line item with the right
  // description, the right price (% of project budget), and stamps the leadNote
  // with stage context. Keeps Pattern A simple: one invoice = one ask.
  const STAGE_PRESETS: Record<string, { label: string; percent: number }> = {
    ADVANCE: { label: "Advance", percent: 50 },
    MILESTONE: { label: "Milestone", percent: 30 },
    FINAL: { label: "Final", percent: 20 },
    FULL: { label: "Full payment", percent: 100 },
  };

  const applyStage = (stage: string) => {
    if (!stage) return;
    const preset = STAGE_PRESETS[stage];
    if (!preset) return;
    const projectId = form.watch("projectId");
    const project = projects.find((p) => p.id === projectId);
    const budget = project?.budget ? Number(project.budget) : 0;
    const stagePrice = budget > 0 ? Math.round((budget * preset.percent) / 100) : 0;
    const description = `${preset.percent}% ${preset.label} Payment${project?.name ? ` — ${project.name}` : ""}`;

    setItems((prev) => {
      const next = [...prev];
      next[0] = {
        ...next[0],
        description,
        unitPrice: stagePrice || next[0].unitPrice,
        quantity: 1,
      };
      return next;
    });

    const projectLine = budget > 0 ? ` · Project value ₹${budget.toLocaleString("en-IN")}` : "";
    setLeadNote(`${preset.percent}% ${preset.label}${projectLine}`);
  };

  const onSubmit = (values: FormValues) => {
    const validItems = items.filter((item) => item.description && item.unitPrice > 0);
    if (validItems.length === 0) return;

    createMutation.mutate(
      {
        clientId: values.clientId,
        projectId: values.projectId || undefined,
        dueDate: values.dueDate.toISOString(),
        leadNote: leadNote.trim() ? leadNote.trim() : undefined,
        referenceNumber: referenceNumber.trim() ? referenceNumber.trim() : undefined,
        // Server expects per-line `price`, not a global tax %.
        items: validItems.map((it) => ({
          description: it.description,
          duration: it.duration?.trim() ? it.duration.trim() : undefined,
          quantity: it.quantity,
          price: it.unitPrice,
        })),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
          setItems([{ description: "", quantity: 1, unitPrice: 0 }]);
          setLeadNote("");
          setReferenceNumber("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Client" required error={form.formState.errors.clientId?.message}>
              <Select value={form.watch("clientId")} onValueChange={(v) => form.setValue("clientId", v)} placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))} error={!!form.formState.errors.clientId} />
            </FormField>
            <FormField label="Project">
              <Select value={form.watch("projectId")} onValueChange={(v) => form.setValue("projectId", v)} placeholder="Optional"
                options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Due Date" required error={form.formState.errors.dueDate?.message}>
              <DatePicker value={form.watch("dueDate")} onChange={(d) => form.setValue("dueDate", d!)} error={!!form.formState.errors.dueDate} />
            </FormField>
            <FormField label="Stage">
              <Select
                value=""
                onValueChange={applyStage}
                placeholder="Apply preset…"
                options={Object.entries(STAGE_PRESETS).map(([k, v]) => ({
                  value: k,
                  label: `${v.percent}% ${v.label}`,
                }))}
              />
            </FormField>
            <FormField label="Tax (%)">
              <NumberInput value={form.watch("tax")} onChange={(v) => form.setValue("tax", v ?? 0)} suffix="%" />
            </FormField>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Line Items</span>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus className="mr-1 size-3" /> Add Item</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Description" className="flex-1" />
                  <Input value={item.duration ?? ""} onChange={(e) => updateItem(i, "duration", e.target.value)} placeholder="Duration" className="w-32" />
                  <NumberInput value={item.quantity} onChange={(v) => updateItem(i, "quantity", v ?? 1)} placeholder="Qty" className="w-20" />
                  <NumberInput value={item.unitPrice} onChange={(v) => updateItem(i, "unitPrice", v ?? 0)} prefix="₹" placeholder="Price" className="w-32" />
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="size-3.5 text-red-500" /></Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
              Subtotal: ₹{subtotal.toLocaleString("en-IN")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Reference / PO Number (optional)">
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. PO-2025-0042"
              />
            </FormField>
            <FormField label="Note above terms (optional)">
              <Input
                value={leadNote}
                onChange={(e) => setLeadNote(e.target.value)}
                placeholder='e.g. *Physical shooting not included.'
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Invoice"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
