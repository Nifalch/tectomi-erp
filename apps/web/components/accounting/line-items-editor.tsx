"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

export interface LineItem {
  itemId?: string;
  description: string;
  /** Free-text duration shown in the PROJECT DURATION column on the printed invoice (e.g. "2-3 days"). */
  duration?: string;
  quantity: number;
  price: number;
  taxRateId?: string;
  accountId?: string;
}

interface TaxOption { id: string; name: string; rate: number }
interface AccountOption { id: string; name: string }

interface LineItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  taxRates: TaxOption[];
  accounts?: AccountOption[];
  showAccount?: boolean;
  /** Hide the Duration column — only relevant for service-based docs (estimates/invoices). Bills usually don't need it. */
  showDuration?: boolean;
}

export function LineItemsEditor({
  items,
  onChange,
  taxRates,
  accounts = [],
  showAccount = false,
  showDuration = true,
}: LineItemsEditorProps) {
  const addRow = () => onChange([...items, { description: "", quantity: 1, price: 0 }]);
  const removeRow = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<LineItem>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange(next);
  };

  const lineAmount = (row: LineItem) => {
    const base = row.quantity * row.price;
    const tax = taxRates.find((t) => t.id === row.taxRateId);
    const taxAmount = tax ? (base * Number(tax.rate)) / 100 : 0;
    return base + taxAmount;
  };

  // Column widths sum to 12. Picked per combination so Tax/Acct selects
  // have enough room to display "GST 18% (18%)" without truncation. The
  // Tailwind classes are inlined as full literals because the JIT
  // compiler can't resolve dynamic template strings.
  const cls = showAccount
    ? {
        desc: "md:col-span-3",
        dur: "md:col-span-2",
        qty: "md:col-span-1",
        price: "md:col-span-2",
        tax: "md:col-span-2",
        acct: "md:col-span-2",
        amount: "md:col-span-2 md:text-right",
      }
    : showDuration
      ? {
          desc: "md:col-span-4",
          dur: "md:col-span-2",
          qty: "md:col-span-1",
          price: "md:col-span-2",
          tax: "md:col-span-2",
          acct: "",
          amount: "md:col-span-1 md:text-right",
        }
      : {
          desc: "md:col-span-5",
          dur: "",
          qty: "md:col-span-1",
          price: "md:col-span-2",
          tax: "md:col-span-3",
          acct: "",
          amount: "md:col-span-1 md:text-right",
        };

  return (
    <div className="rounded-2xl border border-border bg-slate-50/40 p-4 dark:bg-slate-900/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Line Items</span>
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1 size-3" /> Add row
        </Button>
      </div>

      {/* Column headers — visible only on md+ so mobile stays clean. */}
      <div className="mb-1 hidden grid-cols-12 gap-2 px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 md:grid">
        <div className={cls.desc}>Description</div>
        {showDuration && <div className={cls.dur}>Duration</div>}
        <div className={`${cls.qty} text-center`}>Qty</div>
        <div className={cls.price}>Price</div>
        <div className={cls.tax}>Tax</div>
        {showAccount && <div className={cls.acct}>Account</div>}
        <div className={cls.amount}>Amount</div>
      </div>

      <div className="space-y-2">
        {items.map((row, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-xl bg-white p-2 dark:bg-slate-800/50">
            <div className={`col-span-12 ${cls.desc}`}>
              <Input
                value={row.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                placeholder="Description"
              />
            </div>
            {showDuration && (
              <div className={`col-span-6 ${cls.dur}`}>
                <Input
                  value={row.duration ?? ""}
                  onChange={(e) => updateRow(i, { duration: e.target.value })}
                  placeholder="e.g. 2-3 days"
                />
              </div>
            )}
            <div className={`col-span-3 ${cls.qty}`}>
              <NumberInput value={row.quantity} onChange={(v) => updateRow(i, { quantity: v ?? 1 })} placeholder="1" />
            </div>
            <div className={`col-span-3 ${cls.price}`}>
              <NumberInput value={row.price} onChange={(v) => updateRow(i, { price: v ?? 0 })} prefix="₹" />
            </div>
            <div className={`col-span-6 ${cls.tax}`}>
              <Select
                value={row.taxRateId}
                onValueChange={(v) => updateRow(i, { taxRateId: v })}
                placeholder="No tax"
                options={[{ value: "", label: "No tax" }, ...taxRates.map((t) => ({ value: t.id, label: `${t.name} (${t.rate}%)` }))]}
              />
            </div>
            {showAccount && (
              <div className={`col-span-6 ${cls.acct}`}>
                <Select
                  value={row.accountId}
                  onValueChange={(v) => updateRow(i, { accountId: v })}
                  placeholder="Select account"
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              </div>
            )}
            <div className={`col-span-12 flex items-center justify-end gap-1 ${cls.amount}`}>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(lineAmount(row))}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function computeTotals(items: LineItem[], taxRates: TaxOption[], discount = 0) {
  let subtotal = 0;
  let tax = 0;
  items.forEach((row) => {
    const base = row.quantity * row.price;
    subtotal += base;
    const taxRate = taxRates.find((t) => t.id === row.taxRateId);
    if (taxRate) tax += (base * Number(taxRate.rate)) / 100;
  });
  const total = subtotal + tax - discount;
  return { subtotal, tax, total };
}
