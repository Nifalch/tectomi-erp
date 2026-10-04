"use client";

import { ReportShell } from "@/components/reports/report-shell";
import { useReportRange } from "@/components/reports/date-range-bar";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TH, TD } from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useTrialBalance } from "@/lib/api/hooks";
import { formatCurrency, toArray } from "@/lib/utils";

type Row = { code?: string; name?: string; type?: string; debit: number; credit: number };

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export default function TrialBalancePage() {
  const { from, to } = useReportRange();
  const query = useTrialBalance(from, to);

  return (
    <ReportShell title="Trial Balance" description={from && to ? `${from} → ${to}` : undefined}>
      {query.isLoading ? (
        <LoadingState label="Loading trial balance..." />
      ) : query.isError ? (
        <ErrorState label="Unable to load trial balance." />
      ) : (
        (() => {
          const rowsSrc = toArray<any>(query.data?.rows ?? query.data?.accounts ?? query.data);
          const rows: Row[] = rowsSrc.map((r) => ({
            code: r.code ?? r.accountCode ?? "",
            name: r.name ?? r.accountName ?? "",
            type: r.type ?? r.accountType ?? "",
            debit: num(r.debit),
            credit: num(r.credit),
          }));
          const totalDebit = num(query.data?.totalDebit) || rows.reduce((s, r) => s + r.debit, 0);
          const totalCredit = num(query.data?.totalCredit) || rows.reduce((s, r) => s + r.credit, 0);
          const balanced = Math.abs(totalDebit - totalCredit) < 0.5;

          return (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH>Code</TH>
                      <TH>Name</TH>
                      <TH>Type</TH>
                      <TH className="text-right">Debit</TH>
                      <TH className="text-right">Credit</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {rows.length === 0 ? (
                      <tr>
                        <TD colSpan={5} className="text-center text-slate-400">No data for this period.</TD>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={i}>
                          <TD className="font-mono text-xs">{r.code}</TD>
                          <TD className="font-medium">{r.name}</TD>
                          <TD className="text-xs text-slate-500">{r.type}</TD>
                          <TD className="text-right font-mono">{r.debit ? formatCurrency(r.debit) : "—"}</TD>
                          <TD className="text-right font-mono">{r.credit ? formatCurrency(r.credit) : "—"}</TD>
                        </tr>
                      ))
                    )}
                    <tr className="border-t-2 border-border font-semibold">
                      <TD colSpan={3}>Totals</TD>
                      <TD className="text-right font-mono">{formatCurrency(totalDebit)}</TD>
                      <TD className="text-right font-mono">{formatCurrency(totalCredit)}</TD>
                    </tr>
                  </TBody>
                </Table>
              </div>
              {!balanced && (
                <div className="mt-4 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
                  Debit and credit do not balance. Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                </div>
              )}
            </Card>
          );
        })()
      )}
    </ReportShell>
  );
}
