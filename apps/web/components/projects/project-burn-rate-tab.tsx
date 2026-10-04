"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChartCard,
  DonutChart,
  StackedBarChart,
  CHART_COLORS,
  CHART_PALETTE,
} from "@/components/charts";
import {
  useProjectBurnRate,
  useProjectExpenses,
  useProjectExpenseSummary,
  useProjectProfitLoss,
} from "@/lib/api/hooks";
import { useDeleteProjectExpense } from "@/lib/api/mutations";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatCurrency, cn } from "@/lib/utils";
import { AddExpenseDialog, type ExpenseRow } from "./add-expense-dialog";

interface BurnRateResponse {
  budget: number;
  laborCost?: number;
  expensesTotal?: number;
  totalSpent: number;
  remaining: number;
  byMonth: Array<{ month: string; hours: number; laborCost?: number; expenses?: number; total?: number; amount?: number }>;
  byUser: Array<{ userId: string; userName: string; hours: number; laborCost?: number; amount?: number }>;
  byCategory?: Array<{ category: string; amount: number; count: number }>;
}

interface ProjectBurnRateTabProps {
  projectId: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  SUBSCRIPTION: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  RENT: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  UTILITY: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  TRAVEL: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  SOFTWARE: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  EQUIPMENT: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  HOSTING: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  MARKETING: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  CONTRACTOR: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  OTHER: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300",
};

const EDIT_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER", "PROJECT_MANAGER"];
const DELETE_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"];

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "slate";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-white";
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", accentClass)}>{value}</p>
    </Card>
  );
}

function CategoryChip({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.OTHER;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", cls)}>
      {category}
    </span>
  );
}

function PnlKpiRow({ projectId }: { projectId: string }) {
  const { data } = useProjectProfitLoss(projectId);
  if (!data) return null;
  const revenue = Number(data.revenue ?? 0);
  if (revenue <= 0) return null;

  const gross = Number(data.grossProfit ?? 0);
  const margin = Number(data.grossMarginPercent ?? 0);
  const invoicesPaid = Number(data.invoicesPaid ?? 0);
  const invoicesTotal = Number(data.invoicesTotal ?? 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Revenue" value={formatCurrency(revenue)} accent="slate" />
      <KpiCard
        label="Gross Profit"
        value={formatCurrency(gross)}
        accent={gross >= 0 ? "emerald" : "rose"}
      />
      <KpiCard
        label="Margin"
        value={`${margin.toFixed(1)}%`}
        accent={gross >= 0 ? "emerald" : "rose"}
      />
      <KpiCard
        label="Invoices Paid"
        value={`${invoicesPaid}/${invoicesTotal}`}
        accent="slate"
      />
    </div>
  );
}

function CategoryDonut({ summary }: { summary: any }) {
  const data = useMemo(() => {
    const list = (summary?.byCategory ?? []) as Array<{ category: string; amount: number }>;
    return list.map((c, i) => ({
      label: c.category,
      value: Number(c.amount ?? 0),
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));
  }, [summary]);

  const total = Number(summary?.totalAmount ?? 0);

  return (
    <ChartCard title="Expenses by category" description="Breakdown of logged expenses">
      <DonutChart
        data={data}
        total={formatCurrency(total)}
        totalLabel="total"
        height={240}
        formatValue={(n) => formatCurrency(n)}
      />
    </ChartCard>
  );
}

function ExpensesPanel({
  projectId,
  canEdit,
  canDelete,
}: {
  projectId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const expenses = useProjectExpenses(projectId);
  const deleteMutation = useDeleteProjectExpense();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const rows = (expenses.data ?? []) as ExpenseRow[];

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (row: ExpenseRow) => {
    setEditing(row);
    setDialogOpen(true);
  };
  const handleDelete = (row: ExpenseRow) => {
    if (!confirm(`Remove expense "${row.description}"?`)) return;
    deleteMutation.mutate({ id: row.id, projectId });
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
            Project Expenses
            <span className="ml-2 text-xs font-normal text-slate-400">({rows.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Subscriptions, contractors, software, and other project costs.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleAdd} className="shrink-0">
            <Plus className="mr-1.5 size-3.5" /> Add expense
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-slate-500">
            No expenses logged yet. Add subscriptions, contractor costs, software, etc.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                {canEdit && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/30 last:border-none">
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {row.incurredAt ? new Date(row.incurredAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <CategoryChip category={row.category ?? "OTHER"} />
                  </td>
                  <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">
                    {row.description}
                    {row.recurring && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                        recurring
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(Number(row.amount ?? 0))}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {row.vendor?.name ?? "—"}
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(row)}>Edit</DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem destructive onClick={() => handleDelete(row)}>
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddExpenseDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
      />
    </Card>
  );
}

export function ProjectBurnRateTab({ projectId }: ProjectBurnRateTabProps) {
  const query = useProjectBurnRate(projectId);
  const summary = useProjectExpenseSummary(projectId);
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canEdit = roles.some((r) => EDIT_ROLES.includes(r));
  const canDelete = roles.some((r) => DELETE_ROLES.includes(r));

  const data = query.data as BurnRateResponse | undefined;

  const monthData = useMemo(() => {
    return (data?.byMonth ?? []).map((m) => ({
      label: m.month,
      Labor: Number(m.laborCost ?? m.amount ?? 0),
      Expenses: Number(m.expenses ?? 0),
    })) as Array<Record<string, string | number>>;
  }, [data]);

  const contributors = useMemo(
    () =>
      [...(data?.byUser ?? [])].sort(
        (a, b) => Number(b.laborCost ?? b.amount ?? 0) - Number(a.laborCost ?? a.amount ?? 0),
      ),
    [data],
  );

  if (query.isLoading) return <LoadingState label="Loading budget vs actuals..." />;

  if (query.isError) {
    const msg = (query.error as Error | undefined)?.message ?? "";
    const isForbidden = /403|forbidden|restricted|permission/i.test(msg);
    const isRouteMissing = /cannot get|404|not found/i.test(msg);
    return (
      <Card className="text-sm text-slate-500">
        {isForbidden ? (
          "You don't have permission to view this project's finances."
        ) : isRouteMissing ? (
          <>
            Budget endpoint not available yet — restart the API server.
            <div className="mt-1 text-xs text-slate-400">{msg}</div>
          </>
        ) : (
          <>
            Unable to load budget data.
            {msg && <div className="mt-1 text-xs text-slate-400">{msg}</div>}
          </>
        )}
      </Card>
    );
  }

  if (!data) {
    return <Card className="text-sm text-slate-500">No budget data available.</Card>;
  }

  const budget = Number(data.budget ?? 0);
  const labor = Number(data.laborCost ?? 0);
  const expenses = Number(data.expensesTotal ?? 0);
  const spent = Number(data.totalSpent ?? 0);
  const remaining = Number(data.remaining ?? 0);
  const overBudget = spent > budget;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Budget" value={formatCurrency(budget)} accent="slate" />
        <KpiCard label="Labor" value={formatCurrency(labor)} accent="slate" />
        <KpiCard label="Expenses" value={formatCurrency(expenses)} accent="slate" />
        <KpiCard
          label="Total Spent"
          value={formatCurrency(spent)}
          accent={overBudget ? "rose" : "emerald"}
        />
        <KpiCard
          label="Remaining"
          value={formatCurrency(remaining)}
          accent={remaining < 0 ? "rose" : "emerald"}
        />
      </div>

      <PnlKpiRow projectId={projectId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly spend" description="Labor + expenses per month">
          <StackedBarChart
            data={monthData}
            keys={["Labor", "Expenses"]}
            colors={[CHART_COLORS.primary, CHART_COLORS.amber]}
            formatValue={(n) => formatCurrency(n)}
            height={240}
          />
        </ChartCard>
        <CategoryDonut summary={summary.data} />
      </div>

      <ExpensesPanel projectId={projectId} canEdit={canEdit} canDelete={canDelete} />

      <Card>
        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Top contributors</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Spend by team member, sorted by labor cost</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
                <th className="py-2 pr-3 font-medium">Labor Cost</th>
              </tr>
            </thead>
            <tbody>
              {contributors.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                    No time logged yet.
                  </td>
                </tr>
              ) : (
                contributors.map((c) => (
                  <tr key={c.userId} className="border-b border-border/30 last:border-none">
                    <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">{c.userName}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">
                      {Number(c.hours ?? 0).toFixed(1)}h
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600 dark:text-slate-300">
                      {formatCurrency(Number(c.laborCost ?? c.amount ?? 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
