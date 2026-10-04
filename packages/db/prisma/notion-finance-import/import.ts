/**
 * Notion → Finance module importer.
 *
 * Reads the four CSV files in this folder and materializes:
 *   - 4 BankAccount rows (N7 Main + 3 founder personal accounts)
 *   - Expense rows + matching BankTransaction(DEBIT) per expense
 *   - Revenue rows + matching BankTransaction(CREDIT) per income
 *   - Paired BankTransaction(DEBIT/CREDIT) for internal transfers
 *
 * Multi-account expenses (where one Notion row was split between several
 * founders — e.g. T-Shirt paid by Nifli + Minhaj + Nifal) are decomposed
 * into one Expense+BankTransaction PER account, with the total amount
 * divided equally.
 *
 * Categories from Notion ("Rent", "Utilities", "Food", "Travel",
 * "Salary", blank) are mapped onto the Prisma ExpenseCategory enum.
 * "Salary" doesn't have a matching enum value, so it stores as OTHER
 * with a "Salary" tag in the notes for traceability.
 *
 * Idempotency: this script is NOT idempotent. Run it once on a clean
 * finance state (you just wiped business data, so we're good).
 *
 * Run:
 *   npx tsx prisma/notion-finance-import/import.ts
 */

import {
  PrismaClient,
  BankAccountType,
  BankTxnType,
  ApprovalStatus,
  AccountType,
  AccountSubType,
  JournalEntrySource,
  PaymentType,
  PaymentMethod,
} from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ESM shim — packages/db is "type": "module" so __dirname is unavailable.
const __dirname = dirname(fileURLToPath(import.meta.url));

// System chart accounts the dashboard's /finance/summary totals are
// computed from. We seed these (idempotently) and then post one paired
// JournalEntry per imported Expense / Revenue so the GL agrees with the
// legacy Expense + Revenue tables AND the new BankTransaction ledger.
const SYSTEM_ACCOUNTS = {
  CASH:            { code: "1000", name: "Cash & Bank",        type: AccountType.ASSET,   subType: AccountSubType.CASH },
  SALES_REVENUE:   { code: "4000", name: "Sales Revenue",      type: AccountType.INCOME,  subType: AccountSubType.OPERATING_REVENUE },
  GENERAL_EXPENSE: { code: "5000", name: "General Expense",    type: AccountType.EXPENSE, subType: AccountSubType.OPERATING_EXPENSE },
  SALARY_EXPENSE:  { code: "5100", name: "Salary Expense",     type: AccountType.EXPENSE, subType: AccountSubType.PAYROLL_EXPENSE },
} as const;

const prisma = new PrismaClient();

// ── CSV parsing ─────────────────────────────────────────────────────────
// Tiny RFC-4180 parser — same algorithm as the one in
// apps/web/lib/utils/csv.ts. Handles quoted commas, escaped quotes, BOM.
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\r") {/* skip */}
      else if (ch === "\n") { row.push(cell); records.push(row); row = []; cell = ""; }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); records.push(row); }
  while (records.length && records[records.length - 1].every((v) => v === "")) records.pop();
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (cells[i] ?? "").trim();
    return obj;
  });
  return { headers, rows };
}

const load = (name: string) =>
  parseCsv(readFileSync(resolve(__dirname, name), "utf8"));

// Category mapping from Notion → Prisma ExpenseCategory enum.
// SALARY was added to the enum specifically so co-founder/employee
// salary entries land in their own bucket on the dashboard instead of
// being lumped under OTHER.
function mapCategory(raw: string): "RENT" | "UTILITIES" | "MEALS" | "TRAVEL" | "SALARY" | "OTHER" {
  const v = raw.trim().toLowerCase();
  if (v === "rent") return "RENT";
  if (v === "utilities") return "UTILITIES";
  if (v === "food" || v === "meals") return "MEALS";
  if (v === "travel") return "TRAVEL";
  if (v === "salary") return "SALARY";
  return "OTHER";
}

async function main() {
  // 0. Find the admin user (createdBy for every imported row).
  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: "SUPER_ADMIN" } } } },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No SUPER_ADMIN user found — re-seed first.");
  console.log(`Importing as admin: ${admin.email}`);

  // 0a. Ensure system chart accounts exist (idempotent). The dashboard's
  //     headline totals are sourced from JournalLine rows aggregated by
  //     ChartAccount.type, so without these accounts in place the GL
  //     postings would have nothing to attach to.
  const sysAcct: Record<keyof typeof SYSTEM_ACCOUNTS, { id: string }> = {} as never;
  for (const [key, meta] of Object.entries(SYSTEM_ACCOUNTS)) {
    const acct = await prisma.chartAccount.upsert({
      where: { code: meta.code },
      create: {
        code: meta.code,
        name: meta.name,
        type: meta.type,
        subType: meta.subType,
        isSystem: true,
      },
      update: {},
    });
    sysAcct[key as keyof typeof SYSTEM_ACCOUNTS] = { id: acct.id };
  }
  console.log("  + 4 system chart accounts ensured (Cash, Sales Revenue, General Expense, Salary Expense)");

  // Journal-number sequencer. yyyymm-NNNN, monotonic per month.
  // We mint many of these in a tight loop so a per-call DB count would
  // be wasteful — keep an in-memory counter keyed by month prefix.
  const jeCounters = new Map<string, number>();
  // Seed each prefix from the current max in DB so we don't collide
  // with any pre-existing entries (none expected on a clean install,
  // but safer to be defensive).
  const existing = await prisma.journalEntry.findMany({
    select: { journalNumber: true },
  });
  for (const e of existing) {
    const m = e.journalNumber.match(/^JE-(\d{6})-(\d+)$/);
    if (m) {
      const cur = jeCounters.get(m[1]) ?? 0;
      const n = parseInt(m[2], 10);
      if (n > cur) jeCounters.set(m[1], n);
    }
  }
  function nextJournalNumber(date: Date): string {
    const prefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    const cur = (jeCounters.get(prefix) ?? 0) + 1;
    jeCounters.set(prefix, cur);
    return `JE-${prefix}-${String(cur).padStart(4, "0")}`;
  }

  /** Post a paired JE (one DEBIT line, one CREDIT line). */
  async function postJE(args: {
    date: Date;
    description: string;
    reference?: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
  }) {
    return prisma.journalEntry.create({
      data: {
        journalNumber: nextJournalNumber(args.date),
        date: args.date,
        description: args.description,
        reference: args.reference,
        source: JournalEntrySource.MANUAL,
        createdById: admin!.id,
        lines: {
          create: [
            { accountId: args.debitAccountId, debit: args.amount, credit: 0, sortOrder: 0 },
            { accountId: args.creditAccountId, debit: 0, credit: args.amount, sortOrder: 1 },
          ],
        },
      },
    });
  }

  // 1. Accounts. Opening balance is 0 for every account in the source
  //    sheet — current balances are net inflow − outflow ± transfers,
  //    which we'll recompute from the BankTransactions we insert.
  const accountsCsv = load("accounts.csv");
  const accountByName = new Map<string, { id: string; expected: number }>();

  for (const row of accountsCsv.rows) {
    const name = row.Account;
    const expected = parseFloat(row["Current Balance"]) || 0;
    const isMain = name === "N7 Main Account";
    const created = await prisma.bankAccount.create({
      data: {
        name,
        type: isMain ? BankAccountType.BANK : BankAccountType.CASH,
        currency: "INR",
        openingBalance: 0,
        currentBalance: 0,
        isPrimary: isMain,
        isActive: true,
      },
    });
    accountByName.set(name, { id: created.id, expected });
    console.log(`  + Account: ${name} (expected balance ₹${expected.toLocaleString("en-IN")})`);
  }

  // Payment-number sequencer — the schema has a unique constraint on
  // paymentNumber. Mirroring the format used by PaymentsService.create
  // (PAY-NNNN, monotonic across the whole org).
  let paymentSeq = await prisma.payment.count();
  const nextPaymentNumber = () => `PAY-${String(++paymentSeq).padStart(4, "0")}`;

  // Map the imported expense category onto Prisma's ExpenseCategory
  // enum. The Payment table's `expenseCategory` column is what the
  // /expenses page reads for its category card-strip and filter bar.
  const toExpenseCategory = (c: ReturnType<typeof mapCategory>) => c;

  // Helper: post a single outflow end-to-end. Writes EVERY canonical
  // store so all three views agree —
  //   • Payment table  (type=MADE) → /expenses + /payments pages
  //   • Expense table  (legacy) → /finance dashboard "recent activity" widget
  //   • BankTransaction (paymentId-linked) → bank-account drilldown ledger
  //   • BankAccount.currentBalance (decremented)
  //   • JournalEntry (DR expense / CR cash) → /finance headline totals
  //
  // Salary rows route to SALARY_EXPENSE in the GL; everything else to
  // GENERAL_EXPENSE. ExpenseCategory on Payment uses the lighter
  // RENT/UTILITIES/MEALS/TRAVEL/OTHER taxonomy.
  async function postExpense(args: {
    title: string;
    category: ReturnType<typeof mapCategory>;
    amount: number;
    spentAt: Date;
    notes?: string;
    accountId: string;
    isSalary: boolean;
  }) {
    // 1. Payment row — this is what /expenses + /payments render.
    const pay = await prisma.payment.create({
      data: {
        paymentNumber: nextPaymentNumber(),
        type: PaymentType.MADE,
        amount: args.amount,
        paymentDate: args.spentAt,
        method: PaymentMethod.BANK_TRANSFER,
        notes: [args.title, args.notes].filter(Boolean).join(" — ") || null,
        expenseCategory: toExpenseCategory(args.category),
        bankAccountId: args.accountId,
        createdById: admin!.id,
      },
    });
    // 2. Legacy Expense row — keeps the /finance "recent activity" widget happy.
    const exp = await prisma.expense.create({
      data: {
        title: args.title,
        category: args.category,
        amount: args.amount,
        spentAt: args.spentAt,
        notes: args.notes || null,
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: admin!.id,
        createdById: admin!.id,
      },
    });
    // 3. Bank ledger — linked to the Payment so the drawer can deep-link back.
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: args.accountId,
        date: args.spentAt,
        amount: args.amount,
        type: BankTxnType.DEBIT,
        description: args.title,
        reference: pay.paymentNumber,
        paymentId: pay.id,
      },
    });
    // 4. GL — DR expense, CR cash. Drives the dashboard totals.
    await postJE({
      date: args.spentAt,
      description: args.title,
      reference: pay.paymentNumber,
      debitAccountId: args.isSalary ? sysAcct.SALARY_EXPENSE.id : sysAcct.GENERAL_EXPENSE.id,
      creditAccountId: sysAcct.CASH.id,
      amount: args.amount,
    });
    return exp;
  }

  async function postRevenue(args: {
    title: string;
    source: string;
    amount: number;
    receivedAt: Date;
    notes?: string;
    accountId: string;
  }) {
    const pay = await prisma.payment.create({
      data: {
        paymentNumber: nextPaymentNumber(),
        type: PaymentType.RECEIVED,
        amount: args.amount,
        paymentDate: args.receivedAt,
        method: PaymentMethod.BANK_TRANSFER,
        notes: [args.source, args.notes].filter(Boolean).join(" — ") || null,
        bankAccountId: args.accountId,
        createdById: admin!.id,
      },
    });
    const rev = await prisma.revenue.create({
      data: {
        title: args.title,
        source: args.source || args.title,
        amount: args.amount,
        receivedAt: args.receivedAt,
        notes: args.notes || null,
        createdById: admin!.id,
      },
    });
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: args.accountId,
        date: args.receivedAt,
        amount: args.amount,
        type: BankTxnType.CREDIT,
        description: args.title,
        reference: pay.paymentNumber,
        paymentId: pay.id,
      },
    });
    await postJE({
      date: args.receivedAt,
      description: args.title,
      reference: pay.paymentNumber,
      debitAccountId: sysAcct.CASH.id,
      creditAccountId: sysAcct.SALES_REVENUE.id,
      amount: args.amount,
    });
    return rev;
  }

  // 2. Expenses. Multi-account expenses split evenly across the named
  //    accounts. Some rows have a blank category — they map to OTHER.
  let expenseCount = 0;
  const expensesCsv = load("expenses.csv");
  for (const row of expensesCsv.rows) {
    if (!row.Expense) continue;
    const accountNames = row.Account.split("|").map((s) => s.trim()).filter(Boolean);
    if (accountNames.length === 0) {
      console.warn(`  ! Skipping expense "${row.Expense}" — no account`);
      continue;
    }
    const total = parseFloat(row.Amount) || 0;
    if (total <= 0) continue;
    const date = new Date(row.Date + "T00:00:00.000Z");
    const category = mapCategory(row.Category);
    const isSalary = row.Category.toLowerCase() === "salary";
    // Tag "Salary" rows in the notes since the enum doesn't carry it.
    const salaryTag = isSalary ? "[Salary] " : "";
    // Notion's accounting model: when an expense is linked to multiple
    // accounts, the FULL amount is attributed to each one (it represents
    // "this founder paid for the company" — so each of their personal
    // books carries the whole receipt, and the company owes them back).
    // We mirror that — no equal split.
    const sharedTag = accountNames.length > 1 ? ` (shared cost — each book carries the full amount)` : "";

    for (const acctName of accountNames) {
      const acct = accountByName.get(acctName);
      if (!acct) {
        console.warn(`  ! Unknown account "${acctName}" for expense "${row.Expense}"`);
        continue;
      }
      await postExpense({
        title: row.Expense + sharedTag,
        category,
        amount: total,
        spentAt: date,
        notes: (salaryTag + (row.Notes || "")).trim() || undefined,
        accountId: acct.id,
        isSalary,
      });
      expenseCount++;
    }
  }
  console.log(`  + ${expenseCount} expense rows`);

  // 3. Incomes → Revenue + CREDIT bank txn.
  let incomeCount = 0;
  const incomesCsv = load("incomes.csv");
  for (const row of incomesCsv.rows) {
    if (!row.Income) continue;
    const acct = accountByName.get(row.Account);
    if (!acct) { console.warn(`  ! Unknown account "${row.Account}" for income "${row.Income}"`); continue; }
    const amt = parseFloat(row.Amount) || 0;
    if (amt <= 0) continue;
    await postRevenue({
      title: row.Income,
      source: row.Income,
      amount: amt,
      receivedAt: new Date(row.Date + "T00:00:00.000Z"),
      notes: row.Notes || undefined,
      accountId: acct.id,
    });
    incomeCount++;
  }
  console.log(`  + ${incomeCount} income rows`);

  // 4. Transfers → paired DEBIT/CREDIT (no Expense/Revenue rows; these
  //    are internal moves, not P&L).
  let transferCount = 0;
  const transfersCsv = load("transfers.csv");
  for (const row of transfersCsv.rows) {
    if (!row.Description) continue;
    const from = accountByName.get(row.From);
    const to = accountByName.get(row.To);
    if (!from || !to) { console.warn(`  ! Unknown transfer accounts: ${row.From} → ${row.To}`); continue; }
    const amt = parseFloat(row.Amount) || 0;
    if (amt <= 0) continue;
    const date = new Date(row.Date + "T00:00:00.000Z");
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: from.id,
        date,
        amount: amt,
        type: BankTxnType.DEBIT,
        description: `Transfer to ${row.To}: ${row.Description}`,
        reference: row.Description,
      },
    });
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: to.id,
        date,
        amount: amt,
        type: BankTxnType.CREDIT,
        description: `Transfer from ${row.From}: ${row.Description}`,
        reference: row.Description,
      },
    });
    transferCount++;
  }
  console.log(`  + ${transferCount} transfers`);

  // 5. Recompute currentBalance for every account from its
  //    BankTransactions (CREDIT - DEBIT) and stamp it on BankAccount.
  console.log("\nRecomputing currentBalance per account…");
  const summary: Array<{ Account: string; Expected: string; Computed: string; Match: string }> = [];
  for (const [name, info] of accountByName) {
    const txns = await prisma.bankTransaction.findMany({
      where: { bankAccountId: info.id },
      select: { amount: true, type: true },
    });
    const balance = txns.reduce((s, t) => {
      const v = Number(t.amount);
      return s + (t.type === "CREDIT" ? v : -v);
    }, 0);
    await prisma.bankAccount.update({
      where: { id: info.id },
      data: { currentBalance: balance },
    });
    const match = Math.abs(balance - info.expected) < 0.05 ? "✓" : "MISMATCH";
    summary.push({
      Account: name,
      Expected: `₹${info.expected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
      Computed: `₹${balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
      Match: match,
    });
  }
  console.table(summary);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
