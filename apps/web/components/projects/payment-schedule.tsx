"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, FileText, ExternalLink, CheckCircle2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { TextArea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/state";
import { useProjectPaymentMilestones } from "@/lib/api/hooks";
import {
  useCreatePaymentMilestone,
  useUpdatePaymentMilestone,
  useDeletePaymentMilestone,
  useGenerateMilestoneInvoice,
  useReissueMilestoneInvoice,
  useSnapMilestoneToInvoice,
  useMarkInvoicePaid,
} from "@/lib/api/mutations";
import { formatCurrency, toArray } from "@/lib/utils";

interface MilestoneRow {
  id: string;
  label: string;
  percentage: number | string;
  isExtra?: boolean;
  amount?: number | string | null;
  sortOrder: number;
  status: "PENDING" | "INVOICED" | "PAID" | "SKIPPED";
  dueDate?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: number | string;
    paidAt?: string | null;
    dueDate?: string | null;
  } | null;
}

const STATUS_TONE: Record<MilestoneRow["status"], "neutral" | "info" | "positive" | "warning"> = {
  PENDING: "neutral",
  INVOICED: "info",
  PAID: "positive",
  SKIPPED: "warning",
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(v ?? 0) || 0;
}

/**
 * Mirror the server-side `phaseLabel` helper so the schedule UI shows
 * the same polished positional names that go into the invoice notes
 * (Advance / Milestone / Final). Hides user-typed labels which are
 * often gibberish — but those are still kept around as the *editable*
 * label in the form, and as a subtitle in the row when meaningful.
 */
function phaseLabel(count: number, idx: number): string {
  if (count <= 1) return "Final";
  if (idx === 0) return "Advance";
  if (idx === count - 1) return "Final";
  if (count === 3) return "Milestone";
  return `Milestone ${idx}`;
}

interface MilestoneFormState {
  label: string;
  percentage: number;
  amount: number; // used only when isExtra
  isExtra: boolean;
  dueDate: Date | undefined;
  notes: string;
}

const emptyForm: MilestoneFormState = {
  label: "",
  percentage: 0,
  amount: 0,
  isExtra: false,
  dueDate: undefined,
  notes: "",
};

export function PaymentSchedule({ projectId, budget }: { projectId: string; budget: number }) {
  const query = useProjectPaymentMilestones(projectId);
  const createMutation = useCreatePaymentMilestone(projectId);
  const updateMutation = useUpdatePaymentMilestone(projectId);
  const deleteMutation = useDeletePaymentMilestone(projectId);
  const generateMutation = useGenerateMilestoneInvoice(projectId);
  const reissueMutation = useReissueMilestoneInvoice(projectId);
  const snapMutation = useSnapMilestoneToInvoice(projectId);
  const markPaidMutation = useMarkInvoicePaid();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MilestoneFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MilestoneRow | null>(null);
  const [generateTarget, setGenerateTarget] = useState<MilestoneRow | null>(null);
  const [generateDueDate, setGenerateDueDate] = useState<Date | undefined>(undefined);

  if (query.isLoading) return <LoadingState label="Loading payment schedule..." />;

  const allRows = toArray<MilestoneRow>(query.data);
  const milestones = allRows.filter((m) => !m.isExtra);
  const extras = allRows.filter((m) => m.isExtra);

  /** Amount this row represents — extras carry it directly, regulars derive it from budget × %. */
  const rowAmount = (m: MilestoneRow) =>
    m.isExtra ? num(m.amount) : budget * (num(m.percentage) / 100);

  const totalPct = milestones.reduce((s, m) => s + num(m.percentage), 0);

  const sumInvoiced = allRows
    .filter((m) => m.status === "INVOICED" || m.status === "PAID")
    .reduce((s, m) => s + rowAmount(m), 0);
  const sumPaid = allRows
    .filter((m) => m.status === "PAID")
    .reduce((s, m) => s + rowAmount(m), 0);
  const sumPending = allRows
    .filter((m) => m.status === "PENDING")
    .reduce((s, m) => s + rowAmount(m), 0);

  const extrasTotal = extras.reduce((s, m) => s + num(m.amount), 0);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, percentage: Math.max(0, 100 - totalPct) });
    setFormOpen(true);
  };
  const openCreateExtra = () => {
    setEditingId(null);
    setForm({ ...emptyForm, isExtra: true });
    setFormOpen(true);
  };
  const openEdit = (m: MilestoneRow) => {
    setEditingId(m.id);
    setForm({
      label: m.label,
      percentage: num(m.percentage),
      amount: num(m.amount),
      isExtra: !!m.isExtra,
      dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
      notes: m.notes ?? "",
    });
    setFormOpen(true);
  };
  // Running total excluding the milestone being edited — used for the
  // "would push over 100%" guard. Only regular milestones count toward
  // the cap; extras are billed separately.
  const othersTotalPct = milestones
    .filter((m) => m.id !== editingId)
    .reduce((s, m) => s + num(m.percentage), 0);
  const projectedTotal = +(othersTotalPct + form.percentage).toFixed(2);
  const remainingPct = +(100 - othersTotalPct).toFixed(2);
  const wouldOverflow = !form.isExtra && projectedTotal > 100.01;

  const canSubmit = (() => {
    if (!form.label.trim()) return false;
    if (form.isExtra) return form.amount > 0;
    return form.percentage > 0 && !wouldOverflow;
  })();

  const submit = () => {
    if (!canSubmit) return;
    const payload = form.isExtra
      ? {
          label: form.label.trim(),
          isExtra: true,
          amount: form.amount,
          percentage: 0,
          dueDate: form.dueDate?.toISOString(),
          notes: form.notes || undefined,
        }
      : {
          label: form.label.trim(),
          percentage: form.percentage,
          dueDate: form.dueDate?.toISOString(),
          notes: form.notes || undefined,
        };
    const onDone = { onSuccess: () => { setFormOpen(false); setEditingId(null); setForm(emptyForm); } };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload }, onDone);
    else createMutation.mutate(payload, onDone);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">Payment Schedule</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Bill the client in stages — typically 50% advance, 30% mid-project, 20% on completion.
            Click <span className="font-medium">Generate Invoice</span> when the client should be billed for that stage.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={openCreate}>
          <Plus className="mr-1 size-4" /> Add Milestone
        </Button>
      </div>

      {/* Summary strip */}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-slate-50/60 p-3 dark:bg-slate-800/40">
          <div className="text-xs uppercase tracking-wide text-slate-500">Project Budget</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{formatCurrency(budget)}</div>
        </div>
        <div className="rounded-lg border border-border bg-emerald-50/60 p-3 dark:bg-emerald-900/20">
          <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Paid</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatCurrency(sumPaid)}</div>
        </div>
        <div className="rounded-lg border border-border bg-blue-50/60 p-3 dark:bg-blue-900/20">
          <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">Invoiced (unpaid)</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300">{formatCurrency(sumInvoiced - sumPaid)}</div>
        </div>
        <div className="rounded-lg border border-border bg-slate-50/60 p-3 dark:bg-slate-800/40">
          <div className="text-xs uppercase tracking-wide text-slate-500">Remaining</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{formatCurrency(sumPending)}</div>
        </div>
      </div>

      {totalPct !== 100 && totalPct !== 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
          Schedule percentages add up to <b>{totalPct}%</b> (not 100%). Adjust your milestones so the total is 100%.
        </div>
      )}

      {/* Schedule table */}
      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Milestone</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {milestones.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
                  No milestones. Click "Add Milestone" or use the default 50/30/20 schedule.
                </td>
              </tr>
            ) : (
              milestones.map((m, idx) => {
                const amount = budget * (num(m.percentage) / 100);
                const phase = phaseLabel(milestones.length, idx);
                // Only surface the user-typed label as a subtitle when
                // it's actually meaningful — single-letter / very-short
                // labels almost always read as gibberish on the invoice.
                const showRawLabel =
                  m.label && m.label.trim().length > 2 &&
                  m.label.toLowerCase() !== phase.toLowerCase();
                return (
                  <ScheduleRow
                    key={m.id}
                    primary={phase}
                    secondary={showRawLabel ? m.label : undefined}
                    notes={m.notes}
                    pctCell={`${num(m.percentage)}%`}
                    amount={amount}
                    m={m}
                    budgetReady={budget > 0}
                    onGenerate={() => { setGenerateTarget(m); setGenerateDueDate(undefined); }}
                    onEdit={() => openEdit(m)}
                    onDelete={() => setDeleteTarget(m)}
                    onMarkPaid={() => markPaidMutation.mutate(m.invoice!.id)}
                    markPaidPending={markPaidMutation.isPending}
                    onReissue={() => reissueMutation.mutate(m.id)}
                    reissuePending={reissueMutation.isPending}
                    onSnap={() => snapMutation.mutate(m.id)}
                    snapPending={snapMutation.isPending}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Extras / Change Orders */}
      <div className="mt-8 flex items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">Extras &amp; Change Orders</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Bill the client for scope additions or extra work that came up mid-project. Each extra is a fixed amount, billed separately from the schedule above.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={openCreateExtra}>
          <Plus className="mr-1 size-4" /> Add Extra
        </Button>
      </div>

      {extras.length > 0 && (
        <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-border bg-amber-50/60 px-3 py-2 text-xs dark:bg-amber-900/10">
          <span className="uppercase tracking-wide text-amber-700 dark:text-amber-300">Extras Total</span>
          <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-200">{formatCurrency(extrasTotal)}</span>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {extras.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
                  No extras yet. Use this for scope additions, hourly extras, or any one-off charges.
                </td>
              </tr>
            ) : (
              extras.map((m) => (
                <ScheduleRow
                  key={m.id}
                  primary={m.label}
                  notes={m.notes}
                  pctCell="—"
                  amount={num(m.amount)}
                  m={m}
                  budgetReady={true}
                  onGenerate={() => { setGenerateTarget(m); setGenerateDueDate(undefined); }}
                  onEdit={() => openEdit(m)}
                  onDelete={() => setDeleteTarget(m)}
                  onMarkPaid={() => markPaidMutation.mutate(m.invoice!.id)}
                  markPaidPending={markPaidMutation.isPending}
                  onReissue={() => reissueMutation.mutate(m.id)}
                  reissuePending={reissueMutation.isPending}
                  onSnap={() => snapMutation.mutate(m.id)}
                  snapPending={snapMutation.isPending}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? form.isExtra ? "Edit Extra" : "Edit Milestone"
                : form.isExtra ? "Add Extra / Change Order" : "Add Milestone"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label={form.isExtra ? "What is this extra for?" : "Label"} required>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder={form.isExtra ? "Additional API integration / Extra revision round" : "Advance / Mid-project / Final"}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              {form.isExtra ? (
                <FormField label="Amount" required>
                  <NumberInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v ?? 0 })} prefix="₹" />
                </FormField>
              ) : (
                <FormField label="Percentage" required>
                  <NumberInput value={form.percentage} onChange={(v) => setForm({ ...form, percentage: v ?? 0 })} suffix="%" />
                </FormField>
              )}
              <FormField label="Due Date (optional)">
                <DatePicker value={form.dueDate} onChange={(d) => setForm({ ...form, dueDate: d })} />
              </FormField>
            </div>
            {!form.isExtra && budget > 0 && form.percentage > 0 && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Invoice amount: <span className="font-semibold tabular-nums">{formatCurrency(budget * (form.percentage / 100))}</span>
                <span className="text-slate-400"> (= {form.percentage}% of {formatCurrency(budget)})</span>
              </div>
            )}
            {form.isExtra && form.amount > 0 && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                This will be billed as an additional charge of <span className="font-semibold tabular-nums">{formatCurrency(form.amount)}</span>, on top of the project schedule.
              </div>
            )}
            {wouldOverflow && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
                This would push the schedule to <b>{projectedTotal}%</b>. Only <b>{Math.max(0, remainingPct)}%</b> is available — reduce existing milestones or this one.
              </div>
            )}
            <FormField label="Notes (optional)">
              <TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setFormOpen(false); setEditingId(null); setForm(emptyForm); }}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending || !canSubmit}
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? "Saving..."
                : editingId
                  ? "Save"
                  : form.isExtra ? "Add Extra" : "Add Milestone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={deleteTarget?.isExtra ? "Delete extra" : "Delete milestone"}
        description={
          deleteTarget
            ? deleteTarget.isExtra
              ? `Delete the "${deleteTarget.label}" extra? Only PENDING extras can be deleted.`
              : `Delete the "${phaseLabel(milestones.length, milestones.findIndex((m) => m.id === deleteTarget.id))}" milestone? Only PENDING milestones can be deleted.`
            : ""
        }
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
        loading={deleteMutation.isPending}
      />

      {/* Generate invoice dialog */}
      <Dialog open={!!generateTarget} onOpenChange={(o) => { if (!o) setGenerateTarget(null); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Generate Invoice — {generateTarget
                ? generateTarget.isExtra
                  ? generateTarget.label
                  : phaseLabel(milestones.length, milestones.findIndex((m) => m.id === generateTarget.id))
                : ""}
            </DialogTitle>
          </DialogHeader>
          {generateTarget && (
            <div className="space-y-4">
              <div className={`rounded-lg p-4 ${generateTarget.isExtra ? "bg-amber-50 dark:bg-amber-900/20" : "bg-slate-50 dark:bg-slate-800/60"}`}>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">{generateTarget.isExtra ? "Extra" : "Milestone"}</div>
                    <div className="font-medium">
                      {generateTarget.isExtra
                        ? generateTarget.label
                        : phaseLabel(milestones.length, milestones.findIndex((m) => m.id === generateTarget.id))}
                    </div>
                  </div>
                  {!generateTarget.isExtra && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Percentage</div>
                      <div className="font-medium">{num(generateTarget.percentage)}%</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Project Budget</div>
                    <div className="font-medium tabular-nums">{formatCurrency(budget)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Invoice Amount</div>
                    <div className="text-lg font-bold tabular-nums text-primary">
                      {formatCurrency(
                        generateTarget.isExtra
                          ? num(generateTarget.amount)
                          : budget * (num(generateTarget.percentage) / 100),
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <FormField label="Due Date (optional — defaults to org payment terms)">
                <DatePicker value={generateDueDate} onChange={setGenerateDueDate} />
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGenerateTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!generateTarget) return;
                generateMutation.mutate(
                  { id: generateTarget.id, dueDate: generateDueDate?.toISOString() },
                  { onSuccess: () => setGenerateTarget(null) },
                );
              }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating..." : "Generate Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Single row for either the schedule or the extras table. The two
 * tables share most of the layout; the only differences are what goes
 * in the % cell (a percentage vs. an em-dash) and the primary label.
 */
function ScheduleRow(props: {
  primary: string;
  secondary?: string;
  notes?: string | null;
  pctCell: string;
  amount: number;
  m: MilestoneRow;
  budgetReady: boolean;
  onGenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
  markPaidPending: boolean;
  onReissue: () => void;
  reissuePending: boolean;
  onSnap: () => void;
  snapPending: boolean;
}) {
  const { primary, secondary, notes, pctCell, amount, m, budgetReady } = props;
  const isPending = m.status === "PENDING";
  // Issued amount no longer matches what budget × pct produces — usually
  // because someone edited the percentage or the project budget after
  // the invoice was already generated. Surface it inline so staff can
  // see what the client sees and fix it via "Reissue".
  const issuedTotal = m.invoice ? Number(m.invoice.total ?? 0) : null;
  const mismatch =
    issuedTotal != null && Math.abs(issuedTotal - amount) > 0.5;
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <div className="font-medium">{primary}</div>
        {secondary && <div className="mt-0.5 text-xs text-slate-400">{secondary}</div>}
        {notes && <div className="mt-0.5 text-xs text-slate-500">{notes}</div>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{pctCell}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(amount)}</td>
      <td className="px-3 py-2 text-slate-600">
        {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-2">
        <Badge tone={STATUS_TONE[m.status]} size="sm" dot>{m.status}</Badge>
      </td>
      <td className="px-3 py-2">
        {m.invoice ? (
          <div>
            <Link
              href={`/invoices/${m.invoice.id}/print`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {m.invoice.invoiceNumber} <ExternalLink className="size-3" />
            </Link>
            {mismatch && (
              <div className="mt-0.5 text-[10px] leading-tight text-amber-600 dark:text-amber-400" title={`Issued ${formatCurrency(issuedTotal ?? 0)}, expected ${formatCurrency(amount)}`}>
                Issued {formatCurrency(issuedTotal ?? 0)} — expected {formatCurrency(amount)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {isPending && (
            <>
              <Button size="sm" onClick={props.onGenerate} disabled={!budgetReady}>
                <FileText className="mr-1 size-3.5" />
                Generate Invoice
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onEdit} title="Edit">
                <Pencil className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onDelete} title="Delete" className="text-red-500">
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
          {/* Reissue — only meaningful when the issued amount has
              drifted from the recomputed expected AND the milestone
              isn't paid (voiding a paid invoice would orphan the
              payment). */}
          {m.status === "INVOICED" && mismatch && (
            <Button
              size="sm"
              variant="secondary"
              onClick={props.onReissue}
              disabled={props.reissuePending}
              title="Void this invoice and reissue at the current expected amount"
            >
              {props.reissuePending ? "Reissuing…" : "Reissue at ₹"}
            </Button>
          )}
          {m.status === "INVOICED" && m.invoice && (
            <Button
              size="sm"
              onClick={props.onMarkPaid}
              disabled={props.markPaidPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              title="Mark this invoice as paid"
            >
              <CheckCircle2 className="mr-1 size-3.5" />
              {props.markPaidPending ? "..." : "Mark Paid"}
            </Button>
          )}
          {/* Snap — for PAID milestones with drift. Can't void a paid
              invoice, but we can update the milestone's percentage to
              match what was actually billed, which clears the warning
              and aligns history with reality. */}
          {m.status === "PAID" && mismatch && (
            <Button
              size="sm"
              variant="secondary"
              onClick={props.onSnap}
              disabled={props.snapPending}
              title="Update this milestone's percentage so it matches the issued invoice amount"
            >
              {props.snapPending ? "Syncing…" : "Match to invoice"}
            </Button>
          )}
          {m.status === "PAID" && m.invoice?.paidAt && (
            <span className="text-xs text-emerald-600">
              Paid {new Date(m.invoice.paidAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
