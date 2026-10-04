"use client";

import { useState, useMemo } from "react";
import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useClients, useCustomerStatement } from "@/lib/api/hooks";
import { formatCurrency, toArray } from "@/lib/utils";
import { CheckCircle2, FileText, User2 } from "lucide-react";

type Txn = {
  date: string;
  type: "Invoice" | "Payment";
  reference: string;
  amount: number;
  isDebit: boolean;
  balance: number;
  synthetic?: boolean;
  status?: string;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function CustomerStatementPage() {
  const { from, to } = useReportRange();
  const clientsQuery = useClients();
  const [clientId, setClientId] = useState<string>("");
  const stmtQuery = useCustomerStatement(clientId || null, from, to);

  const clients = toArray<{ id: string; companyName?: string; name?: string; email?: string; contactPerson?: string }>(clientsQuery.data);
  const options = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.companyName ?? c.name ?? "Unnamed client" })),
    [clients],
  );

  return (
    <ReportShell title="Customer Statement" description={from && to ? `${from} → ${to}` : undefined}>
      <Card className="print:hidden">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Client</label>
          <Select
            value={clientId}
            onValueChange={setClientId}
            placeholder="Pick a client to view their statement…"
            options={options}
          />
        </div>
      </Card>

      {!clientId ? (
        <Card className="border-dashed py-16 text-center text-sm text-slate-400">
          <User2 className="mx-auto mb-3 size-10 opacity-30" />
          <p>Select a client above to load their account statement.</p>
        </Card>
      ) : stmtQuery.isLoading ? (
        <LoadingState label="Loading statement..." />
      ) : stmtQuery.isError ? (
        <ErrorState label="Unable to load statement." />
      ) : (
        (() => {
          const data = stmtQuery.data as any;
          const invoiceLines: Txn[] = toArray<any>(data?.invoices).map((i) => ({
            date: i.date ?? i.createdAt ?? "",
            type: "Invoice" as const,
            reference: i.invoiceNumber ?? i.number ?? "",
            amount: num(i.total ?? i.amount),
            isDebit: true,
            balance: 0,
            status: i.status,
          }));
          const paymentLines: Txn[] = toArray<any>(data?.payments).map((p) => ({
            date: p.paymentDate ?? p.date ?? "",
            type: "Payment" as const,
            reference: p.paymentNumber ?? p.reference ?? "",
            amount: num(p.amount),
            isDebit: false,
            balance: 0,
            synthetic: !!p.synthetic,
          }));
          const merged = [...invoiceLines, ...paymentLines].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

          const opening = num(data?.openingBalance);
          let running = opening;
          const txns: Txn[] = merged.map((t) => {
            running = running + (t.isDebit ? t.amount : -t.amount);
            return { ...t, balance: running };
          });
          const closing = num(data?.closingBalance ?? running);
          const totalInvoiced = invoiceLines.reduce((s, t) => s + t.amount, 0);
          const totalReceived = paymentLines.reduce((s, t) => s + t.amount, 0);
          const client = data?.client ?? clients.find((c) => c.id === clientId);
          const settled = Math.abs(closing) < 0.5;
          const oweMe = closing > 0;

          return (
            <Card className="p-0">
              {/* ── Lean header ── */}
              <div className="flex flex-wrap items-baseline justify-between gap-6 px-8 pt-10 pb-8 sm:px-12">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Statement of Account
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    {client?.companyName ?? client?.name ?? "Client"}
                  </h2>
                  {from && to && (
                    <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                      {fmtDate(from)} → {fmtDate(to)}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {settled ? "Account settled" : oweMe ? "Balance due" : "In credit"}
                  </div>
                  <div
                    className={`mt-1.5 font-mono text-3xl font-bold tabular-nums tracking-tight ${
                      settled ? "text-slate-500" : oweMe ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {settled ? "—" : formatCurrency(Math.abs(closing))}
                  </div>
                </div>
              </div>

              {/* ── Three quiet figures with generous vertical breathing room ── */}
              <div className="mx-8 grid grid-cols-3 border-y border-border/60 py-7 sm:mx-12">
                <Figure label="Opening" value={formatCurrency(opening)} />
                <Figure label="Invoiced" value={formatCurrency(totalInvoiced)} divider />
                <Figure label="Received" value={formatCurrency(totalReceived)} divider />
              </div>

              {/* ── Activity table — generous row spacing, room above thead ── */}
              <div className="overflow-x-auto pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      <th className="px-8 pt-8 pb-4 text-left sm:px-12">Date</th>
                      <th className="px-3 pt-8 pb-4 text-left">Reference</th>
                      <th className="px-3 pt-8 pb-4 text-right">Debit</th>
                      <th className="px-3 pt-8 pb-4 text-right">Credit</th>
                      <th className="px-8 pt-8 pb-4 text-right sm:px-12">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opening !== 0 && (
                      <tr className="text-slate-500">
                        <td className="px-8 py-5 sm:px-12" colSpan={4}>
                          <span className="text-[11px] uppercase tracking-wide">Opening balance</span>
                        </td>
                        <td className="px-8 py-5 text-right font-mono tabular-nums sm:px-12">
                          {formatCurrency(opening)}
                        </td>
                      </tr>
                    )}
                    {txns.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center text-sm text-slate-400 sm:px-12">
                          No activity in this period.
                        </td>
                      </tr>
                    ) : (
                      txns.map((t, i) => {
                        const isInvoice = t.type === "Invoice";
                        const paid = isInvoice && t.status === "PAID";
                        return (
                          <tr
                            key={i}
                            className="border-t border-border/30 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                          >
                            <td className="px-8 py-5 font-mono text-xs text-slate-500 whitespace-nowrap sm:px-12">
                              {fmtDate(t.date)}
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-2.5">
                                {isInvoice ? (
                                  <FileText className="size-3.5 text-rose-500/70" />
                                ) : (
                                  <CheckCircle2 className="size-3.5 text-emerald-500/70" />
                                )}
                                <span className="font-mono text-xs">{t.reference || (t.synthetic ? "Settled" : "—")}</span>
                                {paid && (
                                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                    paid
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-5 text-right font-mono tabular-nums">
                              {t.isDebit ? (
                                formatCurrency(t.amount)
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                            <td className="px-3 py-5 text-right font-mono tabular-nums">
                              {!t.isDebit ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(t.amount)}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                            <td className="px-8 py-5 text-right font-mono tabular-nums sm:px-12">
                              {formatCurrency(t.balance)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Closing line — single thin rule, plenty of vertical room ── */}
              <div className="mt-2 flex items-center justify-between border-t border-border px-8 py-7 sm:px-12">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Closing balance
                </span>
                <span
                  className={`font-mono text-base font-bold tabular-nums ${
                    settled ? "text-slate-500" : oweMe ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {formatCurrency(Math.abs(closing))}
                </span>
              </div>
            </Card>
          );
        })()
      )}
    </ReportShell>
  );
}

function Figure({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={divider ? "border-l border-border/60 pl-6" : ""}>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
