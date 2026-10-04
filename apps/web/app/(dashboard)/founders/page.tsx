"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Crown, Plus, X } from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useFounderDashboard, useUsers } from "@/lib/api/hooks";
import { useMarkFounder } from "@/lib/api/mutations";
import { formatCurrency } from "@/lib/utils";

interface UserRow {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  employeeProfile?: { isFounder?: boolean } | null;
}

export default function FoundersPage() {
  const q = useFounderDashboard();
  const [addOpen, setAddOpen] = useState(false);
  if (q.isLoading) return <LoadingState label="Loading founder dashboard…" />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load founder dashboard." />;

  const { founders, capTable } = q.data;
  const totalOwedByCompany = founders.reduce((acc, f) => acc + Math.max(0, f.capitalBalance), 0);
  const totalOwedToCompany = founders.reduce((acc, f) => acc + Math.max(0, -f.capitalBalance), 0);

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeader
        module="hr"
        title="Founders"
        description="Capital accounts, equity stakes, and total subsidy at a glance."
        primaryAction={{
          label: "Add co-founder",
          icon: <Plus className="mr-1 size-4" />,
          onClick: () => setAddOpen(true),
        }}
      />

      {founders.length === 0 ? (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No co-founders flagged yet. Click <span className="font-semibold">Add co-founder</span> above to mark an existing employee as one.
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 size-4" />
              Add co-founder
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <Card className="border-l-4 border-l-indigo-500">
              <div className="text-xs uppercase tracking-wider text-slate-400">Founders</div>
              <div className="mt-1 text-2xl font-bold">{founders.length}</div>
              <div className="text-xs text-slate-500">Active co-founders</div>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <div className="text-xs uppercase tracking-wider text-slate-400">Company owes</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{formatCurrency(totalOwedByCompany)}</div>
              <div className="text-xs text-slate-500">Total IOU to founders</div>
            </Card>
            <Card className="border-l-4 border-l-rose-500">
              <div className="text-xs uppercase tracking-wider text-slate-400">Founders owe</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-rose-600">{formatCurrency(totalOwedToCompany)}</div>
              <div className="text-xs text-slate-500">Net debits across founders</div>
            </Card>
            <Card className="border-l-4 border-l-slate-400">
              <div className="text-xs uppercase tracking-wider text-slate-400">Company valuation</div>
              {capTable ? (
                <>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(capTable.companyValuation)}</div>
                  <div className="text-xs text-slate-500">
                    <Link href="/cap-table" className="hover:underline">
                      As of {new Date(capTable.asOf).toLocaleDateString()} →
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-sm text-slate-500">
                  <Link href="/cap-table" className="hover:underline">Record one →</Link>
                </div>
              )}
            </Card>
          </section>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <CardTitle>Founders</CardTitle>
              <span className="text-xs text-slate-500">Sorted by capital balance (highest IOU first)</span>
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Founder</TH>
                  <TH className="text-right">Capital balance</TH>
                  <TH className="text-right">Deferred salary</TH>
                  <TH className="text-right">Shares</TH>
                  <TH className="text-right">Vested</TH>
                  <TH className="text-right">Ownership %</TH>
                  <TH className="text-right">Vested value</TH>
                  <TH className="text-right" />
                </tr>
              </THead>
              <TBody>
                {founders.map((f) => (
                  <FounderRow key={f.userId} f={f} />
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}

      <AddFounderDialog open={addOpen} onOpenChange={setAddOpen} alreadyFounderIds={founders.map((f) => f.userId)} />
    </div>
  );
}

function FounderRow({
  f,
}: {
  f: {
    userId: string;
    name: string;
    email: string;
    capitalBalance: number;
    deferredSalary: number;
    shares: number;
    vested: number;
    ownershipPct: number;
    vestedValue: number;
  };
}) {
  const mark = useMarkFounder();
  return (
    <tr>
      <TD>
        <Link
          href={`/hr/employees/${f.userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <Avatar
            initials={(f.name.slice(0, 2) || f.email.slice(0, 2)).toUpperCase()}
            className="size-8"
          />
          <div>
            <div className="font-medium">{f.name}</div>
            <div className="text-xs text-slate-500">{f.email}</div>
          </div>
        </Link>
      </TD>
      <TD className="text-right">
        <span className={f.capitalBalance >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
          {f.capitalBalance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(f.capitalBalance))}
        </span>
      </TD>
      <TD className="text-right tabular-nums">{formatCurrency(f.deferredSalary)}</TD>
      <TD className="text-right tabular-nums">{f.shares.toLocaleString()}</TD>
      <TD className="text-right tabular-nums text-emerald-700">{f.vested.toLocaleString()}</TD>
      <TD className="text-right tabular-nums">
        {f.ownershipPct > 0 ? `${f.ownershipPct.toFixed(2)}%` : <Badge tone="neutral" size="sm">No valuation</Badge>}
      </TD>
      <TD className="text-right tabular-nums">{formatCurrency(f.vestedValue)}</TD>
      <TD className="text-right">
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-600 hover:bg-rose-50"
          disabled={mark.isPending}
          title="Remove the co-founder flag (capital + equity records are preserved)"
          onClick={() => {
            if (confirm(`Remove ${f.name} from co-founders? Their capital account and equity grants stay on file but stop showing here.`)) {
              mark.mutate({ userId: f.userId, isFounder: false });
            }
          }}
        >
          <X className="size-3.5" />
        </Button>
      </TD>
    </tr>
  );
}

function AddFounderDialog({
  open,
  onOpenChange,
  alreadyFounderIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alreadyFounderIds: string[];
}) {
  const usersQuery = useUsers();
  const mark = useMarkFounder();
  const [search, setSearch] = useState("");

  // Candidates = active users who aren't already flagged as founders.
  // We re-check `employeeProfile.isFounder` in case the dashboard cache
  // is stale (a profile edit might've happened in another tab).
  const candidates = useMemo(() => {
    const users = ((usersQuery.data?.data ?? []) as unknown as UserRow[])
      .filter((u) => !alreadyFounderIds.includes(u.id))
      .filter((u) => !u.employeeProfile?.isFounder);
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email}`.toLowerCase();
      return name.includes(q);
    });
  }, [usersQuery.data, alreadyFounderIds, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add co-founder</DialogTitle>
          <DialogDescription>
            Pick an existing employee to flag as a co-founder. Once flagged they get a Founder badge,
            a capital-account ledger, and inline deferred-salary tracking on their pay slips.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-3">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          {usersQuery.isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Loading employees…</div>
          ) : candidates.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              {search.trim()
                ? "No employees match that search."
                : "All active employees are already co-founders 🎉"}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {candidates.map((u) => {
                const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
                return (
                  <li key={u.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar initials={name.slice(0, 2).toUpperCase()} className="size-8" />
                      <div>
                        <div className="text-sm font-medium">{name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={mark.isPending}
                      onClick={() =>
                        mark.mutate(
                          { userId: u.id, isFounder: true },
                          { onSuccess: () => onOpenChange(false) },
                        )
                      }
                    >
                      <Crown className="mr-1 size-3.5" />
                      Mark
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
