"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useCapTable, useCompanyValuations, useUsers,
  type CapTableRow, type CompanyValuationRow,
} from "@/lib/api/hooks";
import {
  useCreateCompanyValuation, useCreateEquityGrant, useDeleteCompanyValuation,
  useDeleteEquityGrant, useUpdateCompanyValuation, useUpdateEquityGrant,
} from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatCurrency } from "@/lib/utils";

interface UserOption { id: string; firstName?: string; lastName?: string; email: string }

export default function CapTablePage() {
  const cap = useCapTable();
  const valuations = useCompanyValuations();
  const users = useUsers({ includeInactive: false });
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  // Only SUPER_ADMIN can mutate historical valuations — see service-level
  // guard. We mirror the role check here so the buttons don't even render
  // for ADMIN / HR_MANAGER (avoids confusing "you don't have permission"
  // toasts after a click).
  const canEditValuation = roles.includes("SUPER_ADMIN");
  const [grantOpen, setGrantOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [editingValuation, setEditingValuation] = useState<CompanyValuationRow | null>(null);
  const [editingGrant, setEditingGrant] = useState<CapTableRow | null>(null);
  const deleteValuation = useDeleteCompanyValuation();
  const deleteGrant = useDeleteEquityGrant();

  if (cap.isLoading) return <LoadingState label="Loading cap table…" />;
  if (cap.isError || !cap.data) return <ErrorState label="Unable to load cap table." />;

  const { valuation, totals, grants, asOf } = cap.data;
  const userOpts = ((users.data?.data ?? []) as unknown as UserOption[]).map((u) => ({
    value: u.id,
    label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
  }));

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeader
        module="hr"
        title="Cap Table"
        description="Equity grants, vesting, and ownership across all share-holders."
        primaryAction={{
          label: "Record valuation",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => setValuationOpen(true),
        }}
        secondaryActions={[
          { label: "Add grant", icon: <Plus className="mr-1 size-4" />, onClick: () => setGrantOpen(true) },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-5">
        <Card className="border-l-4 border-l-indigo-500">
          <div className="text-xs uppercase tracking-wider text-slate-400">Company valuation</div>
          {valuation ? (
            <>
              <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(valuation.companyValuation)}</div>
              <div className="text-xs text-slate-500">
                ₹{valuation.sharePrice.toFixed(2)} / share · {valuation.totalShares.toLocaleString()} shares
              </div>
              <div className="text-[11px] text-slate-400">As of {new Date(valuation.asOf).toLocaleDateString()}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-slate-500">No valuation recorded yet — click "Record valuation".</div>
          )}
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Issued shares</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{totals.issued.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Active grants only</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Vested</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{totals.vested.toLocaleString()}</div>
          <div className="text-xs text-slate-500">
            {totals.denominator > 0 ? `${((totals.vested / totals.denominator) * 100).toFixed(1)}%` : "—"} of denominator
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Outstanding (unvested)</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{totals.outstanding.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Still vesting</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-slate-400">Cash invested</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(totals.cashInvested)}</div>
          <div className="text-xs text-slate-500">Total raised from external grants</div>
        </Card>
      </section>

      <Card>
        <CardTitle>Grants</CardTitle>
        <div className="mb-2 text-xs text-slate-500">As of {new Date(asOf).toLocaleDateString()}</div>
        <Table>
          <THead>
            <tr>
              <TH>Holder</TH>
              <TH>Type</TH>
              <TH>Granted</TH>
              <TH>Vesting</TH>
              <TH className="text-right">Shares</TH>
              <TH className="text-right">Vested</TH>
              <TH className="text-right">Ownership %</TH>
              <TH className="text-right">Value (vested)</TH>
              {canEditValuation && <TH className="w-20 text-right">Actions</TH>}
            </tr>
          </THead>
          <TBody>
            {grants.length === 0 ? (
              <tr><td colSpan={canEditValuation ? 9 : 8} className="py-8 text-center text-sm text-slate-400">No active grants. Click "Add grant" to create one.</td></tr>
            ) : (
              grants.map((g) => (
                <tr key={g.id}>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{g.holder.name}</span>
                      {g.holder.kind === "EXTERNAL" && (
                        <Badge tone="warning" size="sm">External</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {g.holder.email ?? <span className="text-slate-400">no email</span>}
                      {g.holder.organization && (
                        <span className="ml-1 text-slate-400">· {g.holder.organization}</span>
                      )}
                    </div>
                    {g.investmentAmount && g.investmentAmount > 0 && (
                      <div className="text-[11px] text-emerald-600">
                        Invested {formatCurrency(g.investmentAmount)}
                        {g.investmentDate ? ` on ${new Date(g.investmentDate).toLocaleDateString()}` : ""}
                      </div>
                    )}
                  </TD>
                  <TD><Badge tone="info" size="sm">{g.type.replace("_", " ")}</Badge></TD>
                  <TD>{new Date(g.grantDate).toLocaleDateString()}</TD>
                  <TD className="text-xs text-slate-600">
                    {g.vestingMonths > 0
                      ? `${g.vestingMonths}m · ${g.cliffMonths}m cliff`
                      : <span className="text-slate-400">Vested at grant</span>}
                  </TD>
                  <TD className="text-right tabular-nums">{g.shares.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums font-semibold text-emerald-700">{g.vested.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{g.ownershipPct.toFixed(2)}%</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(g.valueAtCurrent)}</TD>
                  {canEditValuation && (
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setEditingGrant(g)}
                          title="Edit grant"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                          disabled={deleteGrant.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete the ${g.shares.toLocaleString()}-share grant for ${g.holder.name}? Ownership % recomputes for everyone else.`,
                              )
                            ) {
                              deleteGrant.mutate(g.id);
                            }
                          }}
                          title="Delete grant"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TD>
                  )}
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {valuations.data && valuations.data.length > 0 && (
        <Card>
          <CardTitle>Valuation history</CardTitle>
          <Table>
            <THead>
              <tr>
                <TH>As of</TH>
                <TH className="text-right">Total shares</TH>
                <TH className="text-right">Share price</TH>
                <TH className="text-right">Company value</TH>
                <TH>Notes</TH>
                {canEditValuation && <TH className="w-20 text-right">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {valuations.data.map((v) => (
                <tr key={v.id}>
                  <TD>{new Date(v.asOf).toLocaleDateString()}</TD>
                  <TD className="text-right tabular-nums">{v.totalShares.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">₹{Number(v.sharePrice).toFixed(2)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatCurrency(v.totalShares * Number(v.sharePrice))}
                  </TD>
                  <TD className="text-xs text-slate-500">{v.notes ?? "—"}</TD>
                  {canEditValuation && (
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setEditingValuation(v)}
                          title="Edit valuation"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-rose-600 hover:bg-rose-50"
                          disabled={deleteValuation.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete the valuation snapshot from ${new Date(v.asOf).toLocaleDateString()}? Cap-table ownership % will recompute against the next-most-recent snapshot (or fall back to issued totals if this is the only one).`,
                              )
                            ) {
                              deleteValuation.mutate(v.id);
                            }
                          }}
                          title="Delete valuation"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TD>
                  )}
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <AddGrantDialog open={grantOpen} onOpenChange={setGrantOpen} userOpts={userOpts} />
      <AddValuationDialog open={valuationOpen} onOpenChange={setValuationOpen} initialTotalShares={totals.issued} />
      {editingValuation && (
        <EditValuationDialog
          valuation={editingValuation}
          onClose={() => setEditingValuation(null)}
        />
      )}
      {editingGrant && (
        <EditGrantDialog
          grant={editingGrant}
          onClose={() => setEditingGrant(null)}
        />
      )}
    </div>
  );
}

function EditGrantDialog({
  grant, onClose,
}: { grant: CapTableRow; onClose: () => void }) {
  const m = useUpdateEquityGrant(grant.id);
  const [type, setType] = useState(grant.type);
  const [shares, setShares] = useState(String(grant.shares));
  const [grantDate, setGrantDate] = useState(grant.grantDate.slice(0, 10));
  const [vestingMonths, setVestingMonths] = useState(String(grant.vestingMonths));
  const [cliffMonths, setCliffMonths] = useState(String(grant.cliffMonths));
  const [status, setStatus] = useState<"ACTIVE" | "CANCELLED" | "EXERCISED">(
    // Seed from the existing grant — without this, opening the edit dialog
    // for a CANCELLED or EXERCISED grant and saving without touching the
    // dropdown would silently flip it back to ACTIVE.
    (grant.status as "ACTIVE" | "CANCELLED" | "EXERCISED") ?? "ACTIVE",
  );
  const [notes, setNotes] = useState(grant.notes ?? "");

  const submit = () => {
    const s = Number(shares);
    if (!Number.isFinite(s) || s <= 0) return;
    m.mutate(
      {
        type,
        shares: s,
        grantDate,
        vestingMonths: Number(vestingMonths) || 0,
        cliffMonths: Number(cliffMonths) || 0,
        status,
        notes: notes || undefined,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit grant — {grant.holder.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          Editing a grant rewrites ownership % retroactively. Only SUPER_ADMIN can do this.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
              options={[
                { value: "FOUNDER_SHARES", label: "Founder shares" },
                { value: "ESOP", label: "ESOP" },
                { value: "ADVISOR", label: "Advisor" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Shares</label>
              <Input type="number" min={1} value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Grant date</label>
              <Input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Vesting (months)</label>
              <Input type="number" min={0} value={vestingMonths} onChange={(e) => setVestingMonths(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Cliff (months)</label>
              <Input type="number" min={0} value={cliffMonths} onChange={(e) => setCliffMonths(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as typeof status)}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "CANCELLED", label: "Cancelled" },
                { value: "EXERCISED", label: "Exercised" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditValuationDialog({
  valuation, onClose,
}: { valuation: CompanyValuationRow; onClose: () => void }) {
  const m = useUpdateCompanyValuation(valuation.id);
  const [totalShares, setTotalShares] = useState(String(valuation.totalShares));
  const [sharePrice, setSharePrice] = useState(String(Number(valuation.sharePrice)));
  const [asOf, setAsOf] = useState(valuation.asOf.slice(0, 10));
  const [notes, setNotes] = useState(valuation.notes ?? "");

  const submit = () => {
    const ts = Number(totalShares);
    const sp = Number(sharePrice);
    if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(sp) || sp <= 0) return;
    m.mutate(
      { totalShares: ts, sharePrice: sp, asOf, notes: notes || undefined },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Edit valuation</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">
          Updating a historical valuation rewrites cap-table ownership % retroactively.
          Only SUPER_ADMIN can edit these.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Total issued shares</label>
            <Input type="number" min={1} value={totalShares} onChange={(e) => setTotalShares(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Share price (₹)</label>
            <Input type="number" step="0.0001" min="0" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">As of</label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddGrantDialog({
  open, onOpenChange, userOpts,
}: { open: boolean; onOpenChange: (v: boolean) => void; userOpts: Array<{ value: string; label: string }> }) {
  const m = useCreateEquityGrant();
  // Mode: "internal" = pick from existing employees (founders, ESOP recipients,
  // advisors on payroll). "external" = free-text holder name/org (investors,
  // outside advisors who aren't on payroll).
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [employeeId, setEmployeeId] = useState("");
  const [holderName, setHolderName] = useState("");
  const [holderEmail, setHolderEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [investmentDate, setInvestmentDate] = useState("");
  const [type, setType] = useState<"FOUNDER_SHARES" | "ESOP" | "INVESTOR" | "ADVISOR" | "OTHER">("FOUNDER_SHARES");
  const [shares, setShares] = useState("");
  const [grantDate, setGrantDate] = useState(new Date().toISOString().slice(0, 10));
  const [vestingMonths, setVestingMonths] = useState("0");
  const [cliffMonths, setCliffMonths] = useState("0");
  const [notes, setNotes] = useState("");

  // Sensible type defaults when toggling mode — switching to External
  // most often means logging an investor round; switching to Internal
  // most often means founder/ESOP.
  const switchMode = (next: "internal" | "external") => {
    setMode(next);
    if (next === "external" && (type === "FOUNDER_SHARES" || type === "ESOP")) setType("INVESTOR");
    if (next === "internal" && type === "INVESTOR") setType("FOUNDER_SHARES");
  };

  const submit = () => {
    const s = Number(shares);
    if (!Number.isFinite(s) || s <= 0) return;
    if (mode === "internal" && !employeeId) return;
    if (mode === "external" && !holderName.trim()) return;

    const baseData = {
      type,
      shares: s,
      grantDate,
      vestingMonths: Number(vestingMonths) || 0,
      cliffMonths: Number(cliffMonths) || 0,
      notes: notes || undefined,
    };
    const data =
      mode === "internal"
        ? { ...baseData, employeeId }
        : {
            ...baseData,
            holderName: holderName.trim(),
            holderEmail: holderEmail.trim() || undefined,
            organization: organization.trim() || undefined,
            investmentAmount: investmentAmount ? Number(investmentAmount) : undefined,
            investmentDate: investmentDate || undefined,
          };

    m.mutate(data, { onSuccess: () => onOpenChange(false) });
  };

  const submitDisabled =
    m.isPending ||
    !shares ||
    (mode === "internal" ? !employeeId : !holderName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Add equity grant</DialogTitle></DialogHeader>

        {/* Internal / External toggle — pick first because it changes
            which fields below are relevant. */}
        <div className="mb-3 inline-flex rounded-lg border border-border bg-white p-0.5 dark:bg-slate-950">
          {(["internal", "external"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === m
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {m === "internal" ? "Internal employee" : "External investor / advisor"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "internal" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
              <Select value={employeeId} onValueChange={setEmployeeId} options={[{ value: "", label: "Pick employee" }, ...userOpts]} />
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Holder name *</label>
                <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="e.g. Acme Ventures or Priya Investor" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                  <Input value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} placeholder="optional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Organization</label>
                  <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="VC firm / employer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Cash invested (₹)</label>
                  <Input type="number" step="0.01" min="0" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="optional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Investment date</label>
                  <Input type="date" value={investmentDate} onChange={(e) => setInvestmentDate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
              options={[
                { value: "FOUNDER_SHARES", label: "Founder shares" },
                { value: "ESOP", label: "ESOP" },
                { value: "INVESTOR", label: "Investor" },
                { value: "ADVISOR", label: "Advisor" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Shares</label>
              <Input type="number" min={1} value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Grant date</label>
              <Input type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Vesting (months)</label>
              <Input type="number" min={0} value={vestingMonths} onChange={(e) => setVestingMonths(e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">0 = fully vested at grant (typical for investors)</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Cliff (months)</label>
              <Input type="number" min={0} value={cliffMonths} onChange={(e) => setCliffMonths(e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-400">12 + 48 = standard 1-yr cliff / 4-yr vest (ESOP)</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context — round name, terms, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitDisabled}>
            {m.isPending ? "Saving…" : "Add grant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddValuationDialog({
  open, onOpenChange, initialTotalShares,
}: { open: boolean; onOpenChange: (v: boolean) => void; initialTotalShares: number }) {
  const m = useCreateCompanyValuation();
  const [totalShares, setTotalShares] = useState(String(initialTotalShares || 1000000));
  const [sharePrice, setSharePrice] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const submit = () => {
    const ts = Number(totalShares);
    const sp = Number(sharePrice);
    if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(sp) || sp <= 0) return;
    m.mutate(
      { totalShares: ts, sharePrice: sp, asOf, notes: notes || undefined },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Record company valuation</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">
          Sets the denominator for ownership % and the per-share price used to value vested holdings.
          Update whenever you raise, do a 409A, or hit a milestone.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Total issued shares</label>
            <Input type="number" min={1} value={totalShares} onChange={(e) => setTotalShares(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Share price (₹)</label>
            <Input type="number" step="0.0001" min="0" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">As of</label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seed round, 409A, milestone …" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={m.isPending || !totalShares || !sharePrice}>
            {m.isPending ? "Saving…" : "Save valuation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
