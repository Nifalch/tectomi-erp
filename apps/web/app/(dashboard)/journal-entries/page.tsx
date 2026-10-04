"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useJournalEntries, useChartAccounts } from "@/lib/api/hooks";
import { useCreateJournalEntry } from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";

interface JournalRow {
  id: string;
  journalNumber: string;
  date: string;
  description?: string;
  reference?: string;
  lines?: Array<{ debit?: number; credit?: number }>;
}

interface Line { accountId: string; debit: number; credit: number; description: string }

export default function JournalEntriesPage() {
  const query = useJournalEntries();
  const accountsQ = useChartAccounts();
  const createMutation = useCreateJournalEntry();

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { accountId: "", debit: 0, credit: 0, description: "" },
    { accountId: "", debit: 0, credit: 0, description: "" },
  ]);

  if (query.isLoading) return <LoadingState label="Loading journal entries..." />;
  if (query.isError) return <ErrorState label="Unable to load journal entries." />;

  const rows = toArray<JournalRow>(query.data);
  const accounts = toArray<{ id: string; code: string; name: string }>(accountsQ.data);

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setLines([...lines, { accountId: "", debit: 0, credit: 0, description: "" }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const submit = () => {
    if (!balanced || !date) return;
    createMutation.mutate({
      date: date.toISOString(),
      description: description || undefined,
      reference: reference || undefined,
      lines: lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0)).map((l) => ({
        accountId: l.accountId,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || undefined,
      })),
    }, {
      onSuccess: () => {
        setOpen(false);
        setDescription(""); setReference("");
        setLines([{ accountId: "", debit: 0, credit: 0, description: "" }, { accountId: "", debit: 0, credit: 0, description: "" }]);
      },
    });
  };

  const columns: ColumnDef<JournalRow, unknown>[] = [
    { accessorKey: "journalNumber", header: "Journal #", cell: ({ row }) => <span className="font-medium">{row.original.journalNumber}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => row.original.date ? new Date(row.original.date).toLocaleDateString() : "—" },
    { accessorKey: "description", header: "Description", cell: ({ row }) => row.original.description ?? "—" },
    { accessorKey: "reference", header: "Reference", cell: ({ row }) => row.original.reference ?? "—" },
    { id: "total", header: "Total", cell: ({ row }) => {
      const sum = (row.original.lines ?? []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
      return formatCurrency(sum);
    }},
  ];

  return (
    <ListPageLayout module="accounts" title="Journal Entries" description="Manual general ledger entries."
      primaryAction={{ label: "New Journal Entry", icon: <Plus className="mr-1 size-4" />, onClick: () => setOpen(true) }}>
      <DataTable columns={columns} data={rows} searchPlaceholder="Search journals..." moduleColor="accounts"
        emptyState={{ title: "No entries", description: "Create adjusting entries as needed." }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Date"><DatePicker value={date} onChange={setDate} /></FormField>
              <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
              <FormField label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></FormField>
            </div>

            <div className="rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs uppercase dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2 w-1/3">
                        <Select value={l.accountId} onValueChange={(v) => updateLine(i, { accountId: v })} placeholder="Select account"
                          options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput value={l.debit} onChange={(v) => updateLine(i, { debit: v ?? 0, credit: (v ?? 0) > 0 ? 0 : l.credit })} />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput value={l.credit} onChange={(v) => updateLine(i, { credit: v ?? 0, debit: (v ?? 0) > 0 ? 0 : l.debit })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 2 && (
                          <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-destructive">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr className="text-sm font-semibold">
                    <td className="px-3 py-2" colSpan={2}>
                      <Button type="button" variant="ghost" size="sm" onClick={addLine}>+ Add line</Button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totalDebit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totalCredit)}</td>
                    <td />
                  </tr>
                  <tr className={balanced ? "text-emerald-600" : "text-amber-600"}>
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium">
                      {balanced ? "Balanced" : `Difference: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!balanced || createMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}
