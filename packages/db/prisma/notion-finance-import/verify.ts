/** Quick verification: counts + monthly P&L for the imported data. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [accounts, expenses, revenues, txns] = await Promise.all([
    prisma.bankAccount.findMany({ orderBy: { isPrimary: "desc" } }),
    prisma.expense.findMany({ select: { amount: true, category: true, spentAt: true } }),
    prisma.revenue.findMany({ select: { amount: true, receivedAt: true } }),
    prisma.bankTransaction.count(),
  ]);

  console.log("\n=== ACCOUNTS ===");
  for (const a of accounts) {
    console.log(`  ${a.name.padEnd(22)}  bal=₹${Number(a.currentBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14)}  ${a.type}${a.isPrimary ? "  [PRIMARY]" : ""}`);
  }

  console.log("\n=== EXPENSES ===");
  console.log(`  Total: ${expenses.length} rows · ₹${expenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
  for (const [cat, sum] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(20)} ₹${sum.toLocaleString("en-IN", { maximumFractionDigits: 2 }).padStart(14)}`);
  }

  console.log("\n=== REVENUE ===");
  console.log(`  Total: ${revenues.length} rows · ₹${revenues.reduce((s, r) => s + Number(r.amount), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

  console.log("\n=== BANK TRANSACTIONS ===");
  console.log(`  Total rows: ${txns}`);

  // Monthly P&L (date-grouped). Useful to spot any month with funny totals.
  console.log("\n=== MONTHLY P&L (combined across all accounts) ===");
  const monthly = new Map<string, { income: number; expense: number }>();
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const e of expenses) {
    const k = ym(e.spentAt);
    const cur = monthly.get(k) ?? { income: 0, expense: 0 };
    cur.expense += Number(e.amount);
    monthly.set(k, cur);
  }
  for (const r of revenues) {
    const k = ym(r.receivedAt);
    const cur = monthly.get(k) ?? { income: 0, expense: 0 };
    cur.income += Number(r.amount);
    monthly.set(k, cur);
  }
  console.log(`  ${"Month".padEnd(8)} ${"Income".padStart(14)}  ${"Expense".padStart(14)}  ${"Net".padStart(14)}`);
  let runIncome = 0, runExpense = 0;
  for (const [k, v] of [...monthly.entries()].sort()) {
    runIncome += v.income;
    runExpense += v.expense;
    const net = v.income - v.expense;
    console.log(`  ${k.padEnd(8)} ${("₹" + v.income.toLocaleString("en-IN")).padStart(14)}  ${("₹" + v.expense.toLocaleString("en-IN", { maximumFractionDigits: 2 })).padStart(14)}  ${(net >= 0 ? "+" : "") + "₹" + net.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  }
  console.log(`  ${"TOTAL".padEnd(8)} ${("₹" + runIncome.toLocaleString("en-IN")).padStart(14)}  ${("₹" + runExpense.toLocaleString("en-IN", { maximumFractionDigits: 2 })).padStart(14)}  ${(runIncome - runExpense >= 0 ? "+" : "") + "₹" + (runIncome - runExpense).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
}

main().finally(() => prisma.$disconnect());
