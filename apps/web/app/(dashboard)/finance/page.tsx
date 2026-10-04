"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  ArrowUpRight,
  Receipt,
  Wallet,
  Banknote,
  FileText,
  Landmark,
  AlertCircle,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import {
  useFinanceSummary,
  useInvoices,
  useProfitLoss,
  useArAging,
  useApAging,
  useCashFlow,
  useExpensesByCategory,
  useSalesByCustomer,
  useBills,
  usePayments,
  useBankAccounts,
} from "@/lib/api/hooks";
import { ChartCard, TrendChart, DonutChart, HorizontalBarChart, CHART_COLORS } from "@/components/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { toArray, formatCurrency } from "@/lib/utils";
import { useCreatePayment } from "@/lib/api/mutations";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z.number({ error: "Amount is required" }).min(0.01),
  category: z.string().min(1, "Category is required"),
  date: z.date({ error: "Date is required" }),
});

type FormValues = z.infer<typeof schema>;

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function deltaPct(current: number, previous: number): number {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

interface QuickLink {
  href: string;
  title: string;
  description: string;
  icon: typeof Receipt;
  accent: string;
}

const QUICK_LINKS: QuickLink[] = [
  { href: "/invoices", title: "Invoices", description: "Sales invoices and AR", icon: Receipt, accent: "text-emerald-600 bg-emerald-500/10" },
  { href: "/recurring-invoices", title: "Recurring Invoices", description: "Subscription billing", icon: Banknote, accent: "text-indigo-600 bg-indigo-500/10" },
  { href: "/bills", title: "Bills", description: "Vendor bills and AP", icon: FileText, accent: "text-rose-600 bg-rose-500/10" },
  { href: "/payments", title: "Payments", description: "Received and made", icon: Wallet, accent: "text-blue-600 bg-blue-500/10" },
  { href: "/bank-accounts", title: "Bank Accounts", description: "Balances and reconciliation", icon: Landmark, accent: "text-violet-600 bg-violet-500/10" },
];

const REPORT_LINKS = [
  { href: "/reports/profit-loss", label: "Profit & Loss" },
  { href: "/reports/cash-flow", label: "Cash Flow" },
  { href: "/reports/ar-aging", label: "AR Aging" },
  { href: "/reports/ap-aging", label: "AP Aging" },
  { href: "/reports/tax-summary", label: "Tax Summary" },
  { href: "/reports/sales-by-customer", label: "Sales by Customer" },
  { href: "/reports/expenses-by-category", label: "Expenses by Category" },
  { href: "/reports/customer-statement", label: "Customer Statement" },
];

type RangePreset = "ytd" | "12m" | "all";

/** Translate a range preset into ISO from/to strings the report endpoints
 *  understand. Important nuance: the backend's `from`/`to` are NOT
 *  treated as optional in the way you'd hope — when omitted, the P&L
 *  report falls back to a rolling 6-month window (not "all data"). So
 *  "All time" can't just pass undefined; it has to send an explicit
 *  super-wide range that comfortably brackets every record. */
function rangeFor(preset: RangePreset): { from?: string; to?: string; label: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (preset === "ytd") {
    return { from: `${now.getFullYear()}-01-01`, to: today, label: "YTD" };
  }
  if (preset === "12m") {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { from: start.toISOString().slice(0, 10), to: today, label: "Last 12 months" };
  }
  // "all" — pass an explicit 1900→2100 window. The backend's no-params
  // default is a rolling-6-months filter, NOT a true all-time view, so
  // omitting params would silently amputate historical data (the bug
  // that made "All time" look narrower than "YTD" on dashboards).
  return { from: "1900-01-01", to: "2100-12-31", label: "All time" };
}

export default function FinancePage() {
  const [range, setRange] = useState<RangePreset>("ytd");
  const { from, to, label: rangeLabel } = rangeFor(range);

  const query = useFinanceSummary();
  const invoicesQ = useInvoices();
  const billsQ = useBills();
  const paymentsQ = usePayments();
  const banksQ = useBankAccounts();
  const plQ = useProfitLoss(from, to);
  const arQ = useArAging();
  const apQ = useApAging();
  const cashQ = useCashFlow();
  const expQ = useExpensesByCategory(from, to);
  const salesQ = useSalesByCustomer(from, to);
  // Both the Expense and Revenue buttons now write through the same
  // canonical Payment mutation (type=MADE vs type=RECEIVED) so adding a
  // line here reflects in /expenses, /payments, the bank-account ledger,
  // and the dashboard totals at the same time. The legacy
  // useCreateExpense / useCreateRevenue endpoints wrote only to the
  // dead-end Expense / Revenue tables.
  const paymentMutation = useCreatePayment();
  const [dialogType, setDialogType] = useState<"expense" | "revenue" | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (query.isLoading) return <LoadingState label="Loading financials..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load finance data." />;

  const data = query.data as { totals?: { revenue?: number; expenses?: number; net?: number }; invoices?: Array<Record<string, unknown>> };

  const revenue = num(data.totals?.revenue);
  const expenses = num(data.totals?.expenses);
  const net = revenue - expenses;

  const onSubmit = (values: FormValues) => {
    const onSuccess = () => { setDialogType(null); form.reset(); };
    // Default to the primary bank account so the BankAccount.currentBalance
    // moves in step with the new payment. If no primary is set yet, fall
    // back to the first active bank — same graceful degradation as
    // AutoPostService.getPrimaryBank() on the API side.
    const primaryBank = banks.find((b) => (b as { isPrimary?: boolean }).isPrimary) ?? banks[0];
    const payload: Record<string, unknown> = {
      type: dialogType === "expense" ? "MADE" : "RECEIVED",
      amount: values.amount,
      paymentDate: values.date.toISOString().slice(0, 10),
      method: "BANK_TRANSFER",
      notes: values.title,
      bankAccountId: primaryBank?.id,
    };
    if (dialogType === "expense") payload.expenseCategory = values.category;
    paymentMutation.mutate(payload as never, { onSuccess });
  };

  const invoices = toArray<{ id: string; invoiceNumber: string; client: { companyName: string }; total: number; status: string }>(data.invoices);

  const allInvoices = toArray<{ createdAt?: string; paidAt?: string; total?: number; status?: string; amount?: number }>(invoicesQ.data?.data ?? invoicesQ.data);
  const allBills = toArray<{ createdAt?: string; total?: number; status?: string; amountPaid?: number }>(billsQ.data?.data ?? billsQ.data);
  const allPayments = toArray<{ paymentDate?: string; amount?: number; type?: string }>(paymentsQ.data?.data ?? paymentsQ.data);
  const banks = toArray<{ id: string; name: string; currency?: string; currentBalance?: number }>(banksQ.data);

  // ── Revenue trend (12 months)
  const now = new Date();
  const revenueBuckets: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueBuckets[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
  }
  allInvoices.forEach((inv) => {
    const iso = inv.paidAt ?? inv.createdAt;
    if (!iso) return;
    const d = new Date(iso);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (k in revenueBuckets) revenueBuckets[k] += num(inv.total ?? inv.amount);
  });
  const revenueTrend = Object.entries(revenueBuckets).map(([k, v]) => {
    const [, m] = k.split("-");
    return { label: new Date(2000, Number(m) - 1, 1).toLocaleString("en-US", { month: "short" }), value: v };
  });

  // Compare last 30d vs prev 30d for delta
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const cutoff60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  const revenueLast30 = allInvoices
    .filter((i) => i.paidAt && new Date(i.paidAt) >= cutoff30)
    .reduce((s, i) => s + num(i.total ?? i.amount), 0);
  const revenuePrev30 = allInvoices
    .filter((i) => i.paidAt && new Date(i.paidAt) >= cutoff60 && new Date(i.paidAt) < cutoff30)
    .reduce((s, i) => s + num(i.total ?? i.amount), 0);

  // Invoice status pie
  const invoiceStatuses = ["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"] as const;
  const statusColors = [CHART_COLORS.slate, CHART_COLORS.cyan, CHART_COLORS.emerald, CHART_COLORS.red, CHART_COLORS.amber];
  const invoiceStatusData = invoiceStatuses
    .map((s, i) => ({ label: s, value: allInvoices.filter((inv) => inv.status === s).length, color: statusColors[i] }))
    .filter((d) => d.value > 0);

  // Expense donut
  const expensesSrc = toArray<any>(expQ.data?.rows ?? expQ.data?.categories ?? expQ.data);
  const expenseDonut = expensesSrc
    .map((r: any) => ({ label: r.category ?? r.name ?? "Other", value: num(r.total ?? r.amount) }))
    .filter((d) => d.value > 0);

  // Cash flow (try multiple shapes)
  const cf = cashQ.data as any;
  const cfSeries: Array<{ label: string; value: number }> = (() => {
    if (!cf) return [];
    const arr = cf.series ?? cf.months ?? cf.rows ?? cf.data;
    if (Array.isArray(arr)) {
      return arr.map((r: any) => ({
        label: String(r.month ?? r.label ?? r.period ?? ""),
        value: num(r.net ?? r.amount ?? r.total),
      }));
    }
    return [
      { label: "Operating", value: num(cf.operating ?? cf.operatingActivities?.total) },
      { label: "Investing", value: num(cf.investing ?? cf.investingActivities?.total) },
      { label: "Financing", value: num(cf.financing ?? cf.financingActivities?.total) },
    ];
  })();

  // Top clients
  const salesSrc = toArray<any>(salesQ.data?.rows ?? salesQ.data?.customers ?? salesQ.data);
  const topClients = salesSrc
    .map((r: any) => ({ label: String(r.client ?? r.customer ?? r.name ?? "").slice(0, 24), value: num(r.total ?? r.amount ?? r.revenue) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // KPIs from PL/AR/AP
  const pl = plQ.data as any;
  const ytdRevenue = num(pl?.totalIncome ?? pl?.income?.total ?? revenueTrend.reduce((s, r) => s + r.value, 0));
  const ytdExpenses = num(pl?.totalExpenses ?? pl?.expenses?.total);
  const netProfit = num(pl?.netProfit ?? pl?.netIncome ?? ytdRevenue - ytdExpenses);
  const grossMargin = ytdRevenue > 0 ? ((ytdRevenue - ytdExpenses) / ytdRevenue) * 100 : 0;

  const ar = arQ.data as any;
  const ap = apQ.data as any;
  const sumBuckets = (obj: any) => {
    if (!obj) return 0;
    const b = obj.buckets ?? obj;
    return num(b.current) + num(b["1-30"] ?? b.d1_30) + num(b["31-60"] ?? b.d31_60) + num(b["61-90"] ?? b.d61_90) + num(b["90+"] ?? b.d90_plus);
  };
  const outstandingAr = num(ar?.total ?? ar?.grandTotal ?? ar?.outstanding) || sumBuckets(ar);
  const outstandingAp = num(ap?.total ?? ap?.grandTotal ?? ap?.outstanding) || sumBuckets(ap);
  const overdueAr = num((ar?.buckets?.["31-60"] ?? 0)) + num((ar?.buckets?.["61-90"] ?? 0)) + num((ar?.buckets?.["90+"] ?? 0));

  // Counts
  const overdueInvoices = allInvoices.filter((i) => i.status === "OVERDUE").length;
  const draftInvoices = allInvoices.filter((i) => i.status === "DRAFT").length;
  const unpaidBills = allBills.filter((b) => b.status === "OPEN" || b.status === "OVERDUE" || b.status === "PARTIALLY_PAID").length;
  const paymentsLast30 = allPayments.filter((p) => p.paymentDate && new Date(p.paymentDate) >= cutoff30).length;
  const totalCash = banks.reduce((s, b) => s + num(b.currentBalance), 0);

  const revDelta = deltaPct(revenueLast30, revenuePrev30);

  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader
        module="accounts"
        title="Finance & Accounting"
        description="Revenue, expenses, cash, and a single window into AR/AP performance."
        primaryAction={{ label: "Revenue", icon: <Plus className="mr-1 size-4" />, onClick: () => setDialogType("revenue"), permission: "finance:create" }}
        secondaryActions={[{ label: "Expense", onClick: () => setDialogType("expense"), permission: "finance:create" }]}
      />

      {/* ── Date-range toggle ──
          The headline cards default to Year-To-Date, which can amputate
          historical imports (e.g. a Sep 2025 → today dataset shows only
          5 months in YTD if today is May). The toggle lets the user
          switch to 12-month or All-time for full-period views. */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Showing</span>
        {(["ytd", "12m", "all"] as const).map((p) => {
          const labels = { ytd: "Year to date", "12m": "Last 12 months", all: "All time" };
          const active = range === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setRange(p)}
              className={`inline-flex h-7 items-center rounded-full px-3 font-medium transition ${
                active
                  ? "bg-zinc-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {labels[p]}
            </button>
          );
        })}
      </div>

      {/* ── Top KPI strip ── */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={`Revenue (${rangeLabel})`}
          value={formatCurrency(ytdRevenue || revenue)}
          delta={Number.isFinite(revDelta) ? formatPct(revDelta) : undefined}
          deltaTone={revDelta >= 0 ? "positive" : "negative"}
          deltaLabel="vs prev 30d"
        />
        <StatCard
          title={`Expenses (${rangeLabel})`}
          value={formatCurrency(ytdExpenses || expenses)}
        />
        <StatCard
          title="Net Profit"
          value={formatCurrency(netProfit || net)}
          delta={`${grossMargin.toFixed(1)}% margin`}
          deltaTone={netProfit >= 0 ? "positive" : "negative"}
        />
        <StatCard
          title="Cash on Hand"
          value={formatCurrency(totalCash)}
          deltaLabel={`${banks.length} account${banks.length === 1 ? "" : "s"}`}
        />
      </section>

      {/* ── AR/AP/Operations strip ── */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/reports/ar-aging" className="group rounded-2xl border border-border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>Outstanding AR</span>
            <ArrowUpRight className="size-4 opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{formatCurrency(outstandingAr)}</div>
          {overdueAr > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-red-600"><AlertCircle className="size-3" /> {formatCurrency(overdueAr)} overdue</div>
          )}
        </Link>
        <Link href="/reports/ap-aging" className="group rounded-2xl border border-border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>Outstanding AP</span>
            <ArrowUpRight className="size-4 opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-rose-700">{formatCurrency(outstandingAp)}</div>
          <div className="mt-1 text-xs text-slate-500">{unpaidBills} unpaid bill{unpaidBills === 1 ? "" : "s"}</div>
        </Link>
        <Link href="/invoices" className="group rounded-2xl border border-border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>Invoices</span>
            <ArrowUpRight className="size-4 opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span className="text-2xl font-bold">{allInvoices.length}</span>
            <span className="text-xs text-slate-500">total</span>
          </div>
          <div className="mt-1 flex gap-2 text-xs">
            <Badge tone="warning" size="sm">{draftInvoices} draft</Badge>
            <Badge tone="destructive" size="sm">{overdueInvoices} overdue</Badge>
          </div>
        </Link>
        <Link href="/payments" className="group rounded-2xl border border-border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-panel dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>Payments (30d)</span>
            <ArrowUpRight className="size-4 opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums">{paymentsLast30}</div>
          <div className="mt-1 text-xs text-slate-500">received & made</div>
        </Link>
      </section>

      {/* ── Charts ── */}
      <section className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Revenue Trend" description="Last 12 months">
          <TrendChart data={revenueTrend} color={CHART_COLORS.emerald} type="area" height={240} formatValue={(n) => formatCurrency(n)} />
        </ChartCard>
        <ChartCard title="Cash Flow" description="Operating / Investing / Financing">
          <TrendChart data={cfSeries} color={CHART_COLORS.primary} type="area" height={240} formatValue={(n) => formatCurrency(n)} />
        </ChartCard>
        <ChartCard title="Expense Breakdown" description="By category">
          <DonutChart
            data={expenseDonut}
            total={formatCurrency(expenseDonut.reduce((s, d) => s + d.value, 0))}
            totalLabel="total"
            height={240}
            formatValue={(n) => formatCurrency(n)}
          />
        </ChartCard>
        <ChartCard title="Invoice Status" description="Distribution">
          <DonutChart data={invoiceStatusData} total={String(allInvoices.length)} totalLabel="invoices" height={240} />
        </ChartCard>
      </section>

      <ChartCard title="Top Clients by Revenue">
        <HorizontalBarChart data={topClients} color={CHART_COLORS.primary} formatValue={(n) => formatCurrency(n)} />
      </ChartCard>

      {/* ── Bank balances strip ── */}
      {banks.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Bank Balances</CardTitle>
            <Link href="/bank-accounts" className="text-xs text-blue-600 hover:underline">Manage accounts →</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {banks.slice(0, 8).map((b) => (
              <Link key={b.id} href="/bank-accounts" className="flex items-center justify-between rounded-lg border border-border p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-3.5 text-slate-500" />
                    <span className="truncate text-sm font-medium">{b.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{b.currency ?? "INR"}</div>
                </div>
                <div className="text-right text-sm font-semibold tabular-nums">{formatCurrency(num(b.currentBalance))}</div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Quick links / module navigator ── */}
      <Card>
        <CardTitle>Finance Modules</CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-start gap-3 rounded-xl border border-border p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <div className={`rounded-lg p-2 ${link.accent}`}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="truncate font-medium">{link.title}</div>
                    <ArrowUpRight className="size-4 text-slate-400 opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{link.description}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* ── Reports navigator ── */}
      <Card>
        <CardTitle>Financial Reports</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {REPORT_LINKS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {r.label}
            </Link>
          ))}
        </div>
      </Card>

      {/* ── Recent invoices table ── */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Invoices</CardTitle>
          <Link href="/invoices" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <Table>
          <THead><tr><TH>Invoice #</TH><TH>Client</TH><TH>Total</TH><TH>Status</TH></tr></THead>
          <TBody>
            {invoices.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">No invoices.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <TD className="font-medium">
                    <Link href={`/invoices/${inv.id}`} className="hover:text-primary hover:underline">{inv.invoiceNumber}</Link>
                  </TD>
                  <TD>{inv.client?.companyName}</TD>
                  <TD>{formatCurrency(num(inv.total))}</TD>
                  <TD><StatusBadge status={inv.status} /></TD>
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <Dialog open={!!dialogType} onOpenChange={(open) => { if (!open) setDialogType(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add {dialogType === "expense" ? "Expense" : "Revenue"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Title" required error={form.formState.errors.title?.message}>
              <Input {...form.register("title")} error={!!form.formState.errors.title} placeholder="e.g. Cloud hosting" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Amount" required error={form.formState.errors.amount?.message}>
                <NumberInput value={form.watch("amount")} onChange={(v) => form.setValue("amount", v!)} prefix="INR" error={!!form.formState.errors.amount} />
              </FormField>
              <FormField label="Category" required error={form.formState.errors.category?.message}>
                <Input {...form.register("category")} error={!!form.formState.errors.category} placeholder="e.g. Infrastructure" />
              </FormField>
            </div>
            <FormField label="Date" required error={form.formState.errors.date?.message}>
              <DatePicker value={form.watch("date")} onChange={(d) => form.setValue("date", d!)} error={!!form.formState.errors.date} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogType(null)}>Cancel</Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
