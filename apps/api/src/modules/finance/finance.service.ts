import { Injectable } from "@nestjs/common";
import {
  AccountType,
  FounderLedgerDirection,
  JournalEntrySource,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateExpenseDto, CreateRevenueDto } from "./dto/finance.dto";

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    // Totals are sourced from the GL so /finance and /finance/main agree.
    // The legacy `expense` / `revenue` / `transaction` tables aren't
    // written by any automation — they were a quick-tracking layer
    // that pre-dated the proper double-entry GL. We still expose those
    // rows in the response for backwards compatibility with anyone
    // who hand-keyed entries there, but the headline `totals` block now
    // reflects the GL (auto-posted from Payment / PaySlip / Founder
    // ledger) so the dashboard never contradicts /finance/main.
    const [glLines, invoices, expenseList, revenueList, transactions] =
      await this.prisma.$transaction([
        this.prisma.journalLine.findMany({ include: { account: true } }),
        this.prisma.invoice.findMany({
          include: { client: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        this.prisma.expense.findMany({ orderBy: { spentAt: "desc" }, take: 20 }),
        this.prisma.revenue.findMany({ orderBy: { receivedAt: "desc" }, take: 20 }),
        this.prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ]);

    let glRevenue = 0;
    let glExpense = 0;
    for (const l of glLines) {
      const debit = num(l.debit);
      const credit = num(l.credit);
      if (l.account.type === AccountType.INCOME) glRevenue += credit - debit;
      else if (l.account.type === AccountType.EXPENSE) glExpense += debit - credit;
    }

    return {
      totals: {
        expenses: glExpense,
        revenue: glRevenue,
        net: glRevenue - glExpense,
      },
      invoices,
      expenses: expenseList,
      revenues: revenueList,
      transactions,
    };
  }

  async createExpense(createdById: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        category: dto.category,
        amount: dto.amount,
        spentAt: new Date(dto.spentAt),
        notes: dto.notes,
        createdById,
      },
    });
  }

  async createRevenue(createdById: string, dto: CreateRevenueDto) {
    return this.prisma.revenue.create({
      data: {
        title: dto.title,
        source: dto.source,
        amount: dto.amount,
        receivedAt: new Date(dto.receivedAt),
        notes: dto.notes,
        createdById,
      },
    });
  }

  // ── Proper finance dashboard ──
  /**
   * Returns the consolidated finance picture computed from the GL:
   *   - main bank account + opening + computed running balance
   *   - month-to-date inflow / outflow / net
   *   - top-level totals by AccountType (income, expense, asset, ...)
   *   - per-founder running net (from FounderLedgerEntry + deferred PaySlip)
   *   - recent journal entries with deep-link metadata to source records
   *
   * All values are derived from the JournalEntry/JournalLine tables, so
   * everything reconciles by construction once auto-posting + the backfill
   * have run.
   */
  async mainAccount() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [primaryBank, allBanks, accounts, mtdLines, recentEntries, recentBankTxns, founders] =
      await Promise.all([
        this.prisma.bankAccount.findFirst({
          where: { isPrimary: true, isActive: true },
          include: { account: true },
        }),
        this.prisma.bankAccount.findMany({
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        }),
        this.prisma.chartAccount.findMany({
          where: { isActive: true },
          select: { id: true, code: true, name: true, type: true, subType: true },
        }),
        this.prisma.journalLine.findMany({
          where: { journal: { date: { gte: monthStart } } },
          include: { account: true, journal: { select: { date: true } } },
        }),
        this.prisma.journalEntry.findMany({
          orderBy: { date: "desc" },
          take: 20,
          include: { lines: { include: { account: true } } },
        }),
        // Direct bank-transaction history — picks up Payment-driven moves
        // and the mirrored entries we now write for payroll / founder
        // ledger. Lets the dashboard show "20 most recent cash moves on
        // the primary bank" without having to read JEs.
        this.prisma.bankTransaction.findMany({
          orderBy: { date: "desc" },
          take: 20,
          include: { bankAccount: { select: { id: true, name: true, isPrimary: true } } },
        }),
        this.prisma.employeeProfile.findMany({
          where: { isFounder: true, terminatedAt: null },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        }),
      ]);

    // Running balance per ChartAccount across ALL journal entries.
    const allLines = await this.prisma.journalLine.findMany({
      include: { account: true },
    });
    const accountBalances = new Map<string, { account: typeof accounts[number]; debit: number; credit: number }>();
    for (const l of allLines) {
      const slot = accountBalances.get(l.accountId) ?? {
        account: l.account,
        debit: 0,
        credit: 0,
      };
      slot.debit += num(l.debit);
      slot.credit += num(l.credit);
      accountBalances.set(l.accountId, slot);
    }

    // Account-natural-balance: ASSET/EXPENSE = debit - credit; the rest =
    // credit - debit. So a +ve "balance" always reads as "what this
    // account currently holds" for that account's type.
    const balanceOf = (accountId: string): number => {
      const slot = accountBalances.get(accountId);
      if (!slot) return 0;
      const t = slot.account.type;
      if (t === AccountType.ASSET || t === AccountType.EXPENSE) return slot.debit - slot.credit;
      return slot.credit - slot.debit;
    };

    // The cash GL is the system "Cash & Bank" account (code 1000) plus
    // any per-bank GL accounts. We sum them so the dashboard shows total
    // cash on hand regardless of which physical bank received it.
    const cashLikeAccounts = accounts.filter(
      (a) =>
        a.type === AccountType.ASSET &&
        (a.subType === "CASH" || a.subType === "BANK"),
    );
    const totalCashFromGL = cashLikeAccounts.reduce((acc, a) => acc + balanceOf(a.id), 0);

    // Two parallel balance computations — the dashboard surfaces both so
    // any drift between them is visible to HR (means the auto-post is
    // out of sync with the bank's tracked balance — most likely a missed
    // backfill):
    //   - mainBalance:  bank-side authoritative running balance. Just
    //     the sum of each active bank's `currentBalance` — that column is
    //     seeded with the opening balance at create time and then
    //     incremented/decremented on every cash movement, so it's the
    //     live total.
    //   - glBalance:    GL-derived. Cash account net (always starts at
    //     zero since we don't post the opening-balance) plus the bank
    //     openings so the two are comparable. Should equal mainBalance
    //     once auto-post is fully caught up.
    const openingFromBanks = allBanks.reduce((acc, b) => acc + num(b.openingBalance), 0);
    const mainBalance = allBanks.reduce((acc, b) => acc + num(b.currentBalance), 0);
    const glBalance = totalCashFromGL + openingFromBanks;

    // Month-to-date inflows = sum of debits on cash-like accounts;
    // outflows = sum of credits on cash-like accounts.
    const cashIds = new Set(cashLikeAccounts.map((a) => a.id));
    const mtdInflow = mtdLines
      .filter((l) => cashIds.has(l.accountId))
      .reduce((acc, l) => acc + num(l.debit), 0);
    const mtdOutflow = mtdLines
      .filter((l) => cashIds.has(l.accountId))
      .reduce((acc, l) => acc + num(l.credit), 0);

    // Aggregate "what we earned / spent / owe / own" by account type.
    const byType: Record<string, number> = {};
    for (const a of accounts) {
      byType[a.type] = (byType[a.type] ?? 0) + balanceOf(a.id);
    }

    // P&L roll-up — lifetime and month-to-date. Computed off the GL so it
    // includes every auto-posted source (invoice payments, payroll, etc.)
    // plus any manual journal entries.
    const lifetimeIncome = byType[AccountType.INCOME] ?? 0;
    const lifetimeExpense = byType[AccountType.EXPENSE] ?? 0;
    const lifetimeNet = lifetimeIncome - lifetimeExpense;

    const mtdLineByAccount = new Map<string, { account: typeof accounts[number]; debit: number; credit: number }>();
    for (const l of mtdLines) {
      const slot = mtdLineByAccount.get(l.accountId) ?? { account: l.account, debit: 0, credit: 0 };
      slot.debit += num(l.debit);
      slot.credit += num(l.credit);
      mtdLineByAccount.set(l.accountId, slot);
    }
    let mtdIncome = 0;
    let mtdExpense = 0;
    for (const { account, debit, credit } of mtdLineByAccount.values()) {
      // Income natural balance = credit − debit; expense the opposite.
      if (account.type === AccountType.INCOME) mtdIncome += credit - debit;
      else if (account.type === AccountType.EXPENSE) mtdExpense += debit - credit;
    }
    const mtdNet = mtdIncome - mtdExpense;

    // Per-founder net from FounderLedgerEntry + PaySlip.deferredAmount.
    // (We surface this here for the finance dashboard; the same numbers
    // are also available on the Founders dashboard.)
    const founderRows = await Promise.all(
      founders.map(async (f) => {
        const [credits, debits, deferred] = await Promise.all([
          this.prisma.founderLedgerEntry.aggregate({
            where: { employeeId: f.id, direction: FounderLedgerDirection.CREDIT },
            _sum: { amount: true },
          }),
          this.prisma.founderLedgerEntry.aggregate({
            where: { employeeId: f.id, direction: FounderLedgerDirection.DEBIT },
            _sum: { amount: true },
          }),
          this.prisma.paySlip.aggregate({
            where: { employeeId: f.id },
            _sum: { deferredAmount: true },
          }),
        ]);
        const net =
          num(credits._sum.amount) + num(deferred._sum.deferredAmount) - num(debits._sum.amount);
        return {
          userId: f.userId,
          name: `${f.user.firstName} ${f.user.lastName}`.trim(),
          net,
        };
      }),
    );

    return {
      primaryBank: primaryBank
        ? {
            id: primaryBank.id,
            name: primaryBank.name,
            type: primaryBank.type,
            bankName: primaryBank.bankName,
            accountNumber: primaryBank.accountNumber,
            currency: primaryBank.currency,
            openingBalance: num(primaryBank.openingBalance),
            currentBalance: num(primaryBank.currentBalance),
            // currentBalance already includes the opening + every cash
            // movement since, so it IS the live balance.
            liveBalance: num(primaryBank.currentBalance),
            isPrimary: true,
          }
        : null,
      // List ALL banks so the dashboard can offer a "promote this to
      // primary" action when no primary is set yet.
      banks: allBanks.map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        openingBalance: num(b.openingBalance),
        currentBalance: num(b.currentBalance),
        liveBalance: num(b.currentBalance),
        isPrimary: b.isPrimary,
      })),
      mainBalance,
      glBalance,
      reconciled: Math.abs(mainBalance - glBalance) < 0.01,
      monthToDate: { inflow: mtdInflow, outflow: mtdOutflow, net: mtdInflow - mtdOutflow },
      profitLoss: {
        // Cashflow MTD is the bank-side net (inflow − outflow). P&L net
        // is the income-statement view (revenue − expense), which can
        // differ from cashflow when there's deferred salary, accruals,
        // etc. We surface both so HR can read either lens.
        lifetimeIncome,
        lifetimeExpense,
        lifetimeNet,
        mtdIncome,
        mtdExpense,
        mtdNet,
      },
      byType,
      founders: founderRows,
      recentEntries: recentEntries.map((e) => ({
        id: e.id,
        date: e.date,
        journalNumber: e.journalNumber,
        description: e.description,
        source: e.source,
        sourceId: e.sourceId,
        reference: e.reference,
        amount: e.lines.reduce((acc, l) => acc + num(l.debit), 0),
        lines: e.lines.map((l) => ({
          accountCode: l.account.code,
          accountName: l.account.name,
          debit: num(l.debit),
          credit: num(l.credit),
        })),
      })),
      // Recent bank-side transactions across all banks. The dashboard
      // shows these as the "where did the money go?" view alongside the
      // GL entries, since they're the easier-to-read flow log for HR.
      recentBankTransactions: recentBankTxns.map((t) => ({
        id: t.id,
        date: t.date,
        amount: num(t.amount),
        type: t.type,
        description: t.description,
        reference: t.reference,
        bank: {
          id: t.bankAccount.id,
          name: t.bankAccount.name,
          isPrimary: t.bankAccount.isPrimary,
        },
      })),
    };
  }
}
