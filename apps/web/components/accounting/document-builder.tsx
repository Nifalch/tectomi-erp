"use client";

import { useState, useMemo } from "react";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { LineItemsEditor, computeTotals, type LineItem } from "./line-items-editor";
import { formatCurrency, toArray } from "@/lib/utils";
import { useTaxRates, useClients, useProjects, useVendors, useChartAccounts } from "@/lib/api/hooks";
import { QuickAddClientButton } from "@/components/clients/quick-add-client";

export interface BuilderState {
  partyId: string; // clientId or vendorId — empty for vendors when partyName is a new name (resolved on save)
  /** Free-typed vendor/supplier name. For vendors, this is the canonical source — bill save resolves to a vendorId by find-or-create. */
  partyName?: string;
  projectId?: string;
  issueDate?: Date;
  expiryDate?: Date;
  dueDate?: Date;
  notes: string;
  terms: string;
  discount: number;
  items: LineItem[];
}

interface DocumentBuilderProps {
  mode: "estimate" | "invoice" | "bill" | "credit-note" | "recurring-invoice";
  state: BuilderState;
  onChange: (patch: Partial<BuilderState>) => void;
  showProject?: boolean;
  showAccountPerLine?: boolean;
  partyType: "client" | "vendor";
  secondDateLabel?: string;
}

export function DocumentBuilder({
  mode,
  state,
  onChange,
  showProject = true,
  showAccountPerLine = false,
  partyType,
  secondDateLabel,
}: DocumentBuilderProps) {
  const taxesQ = useTaxRates();
  const clientsQ = useClients();
  const projectsQ = useProjects();
  const vendorsQ = useVendors();
  const accountsQ = useChartAccounts();

  const taxRates = toArray<{ id: string; name: string; rate: number }>(taxesQ.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQ.data);
  const vendors = toArray<{ id: string; companyName?: string; name?: string }>(vendorsQ.data);
  const projects = toArray<{ id: string; name: string }>(projectsQ.data);
  const accounts = toArray<{ id: string; name: string; type: string }>(accountsQ.data);
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.companyName }));

  // For vendors: derive the display value from partyName (free-typed) and
  // also auto-resolve partyId when the typed name matches an existing
  // vendor exactly (case-insensitive). On save, the bill page does the
  // final find-or-create against the API so a brand-new name still works.
  const vendorDisplayValue = state.partyName ?? (state.partyId ? vendors.find((v) => v.id === state.partyId)?.companyName ?? "" : "");
  const onVendorTextChange = (text: string) => {
    const trimmed = text.trim();
    const match = trimmed
      ? vendors.find((v) => (v.companyName ?? v.name ?? "").trim().toLowerCase() === trimmed.toLowerCase())
      : undefined;
    onChange({ partyName: text, partyId: match?.id ?? "" });
  };

  const totals = useMemo(() => computeTotals(state.items, taxRates, state.discount), [state.items, taxRates, state.discount]);

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12 space-y-4 lg:col-span-9">
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-slate-900/80">
          <div className="grid grid-cols-2 gap-4">
            <FormField label={partyType === "client" ? "Client" : "Vendor"} required>
              <div className="space-y-1">
                {partyType === "client" ? (
                  <>
                    <Select
                      value={state.partyId}
                      onValueChange={(v) => onChange({ partyId: v })}
                      placeholder="Select client"
                      options={clientOptions}
                    />
                    <QuickAddClientButton onCreated={(id) => onChange({ partyId: id })} />
                  </>
                ) : (
                  <>
                    {/* Free-text vendor: user can type any name. Datalist
                        offers existing vendors as autocomplete; a brand-new
                        name is auto-created on save by the bill page. */}
                    <Input
                      list="vendor-suggestions"
                      value={vendorDisplayValue}
                      onChange={(e) => onVendorTextChange(e.target.value)}
                      placeholder="Type vendor name (e.g. Acme Supplies)"
                    />
                    <datalist id="vendor-suggestions">
                      {vendors.map((v) => (
                        <option key={v.id} value={v.companyName ?? v.name ?? ""} />
                      ))}
                    </datalist>
                    {state.partyName && !state.partyId && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">New vendor &quot;{state.partyName}&quot; — will be created when you save.</p>
                    )}
                  </>
                )}
              </div>
            </FormField>
            {showProject && (
              <FormField label="Project">
                <Select
                  value={state.projectId}
                  onValueChange={(v) => onChange({ projectId: v })}
                  placeholder="Optional"
                  options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </FormField>
            )}
            <FormField label="Issue Date" required>
              <DatePicker value={state.issueDate} onChange={(d) => onChange({ issueDate: d })} />
            </FormField>
            <FormField label={secondDateLabel ?? (mode === "bill" || mode === "invoice" ? "Due Date" : "Expiry Date")}>
              <DatePicker
                value={mode === "bill" || mode === "invoice" ? state.dueDate : state.expiryDate}
                onChange={(d) => onChange(mode === "bill" || mode === "invoice" ? { dueDate: d } : { expiryDate: d })}
              />
            </FormField>
          </div>
        </div>

        <LineItemsEditor
          items={state.items}
          onChange={(items) => onChange({ items })}
          taxRates={taxRates}
          accounts={expenseAccounts}
          showAccount={showAccountPerLine}
          // Duration is a service-doc concept (estimates/invoices); bills
          // and credit-notes don't need it, so hide to free up width for
          // Tax/Account selects.
          showDuration={mode !== "bill" && mode !== "credit-note"}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Notes">
            <TextArea value={state.notes} onChange={(e) => onChange({ notes: e.target.value })} />
          </FormField>
          <FormField label="Terms">
            <TextArea value={state.terms} onChange={(e) => onChange({ terms: e.target.value })} />
          </FormField>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-3">
        <div className="sticky top-6 space-y-2 rounded-2xl border border-border bg-white p-4 dark:bg-slate-900/80">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium tabular-nums">{formatCurrency(totals.subtotal)}</span>
          </div>
          <FormField label="Discount">
            <NumberInput value={state.discount} onChange={(v) => onChange({ discount: v ?? 0 })} prefix="₹" />
          </FormField>
          {totals.tax > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Tax</span>
              <span className="font-medium tabular-nums">{formatCurrency(totals.tax)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-xl font-bold tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useBuilderState(initial?: Partial<BuilderState>) {
  const [state, setState] = useState<BuilderState>({
    partyId: "",
    projectId: "",
    issueDate: new Date(),
    expiryDate: undefined,
    dueDate: undefined,
    notes: "",
    terms: "",
    discount: 0,
    items: [{ description: "", quantity: 1, price: 0 }],
    ...initial,
  });
  const patch = (p: Partial<BuilderState>) => setState((s) => ({ ...s, ...p }));
  return [state, patch, setState] as const;
}
