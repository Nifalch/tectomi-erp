import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountType, InvoiceStatus, BillStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

type Period = { start: Date; end: Date };

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private getPeriod(from?: string, to?: string): Period {
    // `from` parses as midnight UTC at the start of the day — that's
    // what we want for `gte` filters (include everything from that day).
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    // `to` parsed naively also lands at midnight UTC, which silently
    // excludes everything that happened on the final day (payments
    // logged at 9am that day would be > the boundary). Stretch it to
    // end-of-day so `lte` boundaries cover the full date the user
    // picked.
    let end: Date;
    if (to) {
      end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
    } else {
      end = new Date();
    }
    return { start, end };
  }

  /**
   * Per-project billing roll-up. NOT true profitability — we don't have a
   * cost-of-delivery model (no per-user labour rate × logged hours) so we
   * can't subtract delivery cost from billed revenue. What we surface
   * instead is `budgetVariance = billed − budget`, i.e. "are we billing
   * more than we promised the client" (positive = over-billed, negative =
   * still billing). The legacy `profitability` field is kept as an alias
   * for back-compat — same value, accurate name.
   */
  async profitability() {
    // Aggregate billed + logged hours in two grouped queries instead of
    // eagerly pulling every invoice + time entry per project. For a
    // workspace with many projects the old shape returned tens of
    // thousands of joined rows; this returns one summary row per project.
    const projects = await this.prisma.project.findMany({
      select: { id: true, name: true, budget: true },
    });
    if (projects.length === 0) return [];
    const projectIds = projects.map((p) => p.id);
    const [invoiceTotals, timeTotals] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _sum: { total: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _sum: { duration: true },
      }),
    ]);
    const billedBy = new Map<string, number>();
    for (const r of invoiceTotals) {
      if (r.projectId) billedBy.set(r.projectId, Number(r._sum.total ?? 0));
    }
    const loggedMinBy = new Map<string, number>();
    for (const r of timeTotals) {
      if (r.projectId) loggedMinBy.set(r.projectId, r._sum.duration ?? 0);
    }
    return projects.map((project) => {
      const billed = billedBy.get(project.id) ?? 0;
      const loggedHours = (loggedMinBy.get(project.id) ?? 0) / 60;
      const budget = Number(project.budget);
      const budgetVariance = billed - budget;
      return {
        id: project.id,
        name: project.name,
        budget,
        billed,
        loggedHours,
        budgetVariance,
        /** @deprecated misnomer — same value as `budgetVariance`. */
        profitability: budgetVariance,
      };
    });
  }

  async productivity() {
    const users = await this.prisma.user.findMany({
      include: {
        timeEntries: true,
        assignedTasks: true,
        employeeProfile: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      department: user.employeeProfile?.department ?? "N/A",
      taskCount: user.assignedTasks.length,
      loggedHours: user.timeEntries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0) / 60,
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // Zoho-style financial reports
  // ──────────────────────────────────────────────────────────────────

  async profitLoss(from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    // Derive P&L straight from the GL. Each JournalLine on an INCOME
    // account contributes (credit - debit) to that account's revenue
    // total; each line on an EXPENSE account contributes (debit -
    // credit) to that account's expense total. This is the only way the
    // dashboard reflects the auto-posted payments + payroll + recurring
    // expenses; the legacy Revenue / Expense tables (which this report
    // used to read) are no longer written by any feature.
    const accounts = await this.prisma.chartAccount.findMany({
      where: {
        type: { in: [AccountType.INCOME, AccountType.EXPENSE] },
        isActive: true,
      },
      select: { id: true, name: true, type: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const lines = accountIds.length
      ? await this.prisma.journalLine.findMany({
          where: {
            accountId: { in: accountIds },
            journal: { date: { gte: start, lte: end } },
          },
          select: { accountId: true, debit: true, credit: true },
        })
      : [];

    const totalsByAccount = new Map<string, number>();
    for (const l of lines) {
      const acct = accounts.find((a) => a.id === l.accountId);
      if (!acct) continue;
      const debit = toNumber(l.debit);
      const credit = toNumber(l.credit);
      // INCOME normal balance = CREDIT, EXPENSE normal balance = DEBIT.
      const signedAmount = acct.type === AccountType.INCOME ? credit - debit : debit - credit;
      totalsByAccount.set(l.accountId, (totalsByAccount.get(l.accountId) ?? 0) + signedAmount);
    }

    const incomeAccounts = accounts
      .filter((a) => a.type === AccountType.INCOME)
      .map((a) => ({ name: a.name, amount: round2(totalsByAccount.get(a.id) ?? 0) }))
      .filter((a) => Math.abs(a.amount) > 0.01)
      .sort((a, b) => b.amount - a.amount);
    const expenseAccounts = accounts
      .filter((a) => a.type === AccountType.EXPENSE)
      .map((a) => ({ name: a.name, amount: round2(totalsByAccount.get(a.id) ?? 0) }))
      .filter((a) => Math.abs(a.amount) > 0.01)
      .sort((a, b) => b.amount - a.amount);

    const incomeTotal = round2(incomeAccounts.reduce((s, a) => s + a.amount, 0));
    const expensesTotal = round2(expenseAccounts.reduce((s, a) => s + a.amount, 0));
    const grossProfit = round2(incomeTotal);
    const netProfit = round2(incomeTotal - expensesTotal);

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      income: { accounts: incomeAccounts, total: incomeTotal },
      costOfGoodsSold: { accounts: [] as { name: string; amount: number }[], total: 0 },
      grossProfit,
      expenses: { accounts: expenseAccounts, total: expensesTotal },
      netProfit,
    };
  }

  async balanceSheet(from?: string, to?: string) {
    const { end } = this.getPeriod(from, to);

    const accounts = await this.prisma.chartAccount.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    });

    // Compute per-account balance from journal lines as-of `end` — the
    // `balance` column on chartAccount is a live running total, so it
    // can't answer "what did this account look like on a past date".
    // Trial-balance already does this; replicate that pattern.
    const sums = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journal: { date: { lte: end } } },
      _sum: { debit: true, credit: true },
    });
    const sumMap = new Map(sums.map((s) => [s.accountId, s]));

    // Sign convention: assets carry a debit balance (positive when
    // debits > credits); liabilities and equity carry a credit balance
    // (positive when credits > debits). Flipping the sign for
    // liabilities/equity keeps the displayed numbers positive.
    const balanceFor = (accountId: string, type: "ASSET" | "LIABILITY" | "EQUITY") => {
      const s = sumMap.get(accountId);
      const debit = toNumber(s?._sum.debit);
      const credit = toNumber(s?._sum.credit);
      return type === "ASSET" ? debit - credit : credit - debit;
    };

    const group = (type: "ASSET" | "LIABILITY" | "EQUITY") => {
      const filtered = accounts
        .filter((a) => a.type === type)
        .map((a) => ({ name: a.name, balance: round2(balanceFor(a.id, type)) }));
      const total = round2(filtered.reduce((s, a) => s + a.balance, 0));
      return { accounts: filtered, total };
    };

    const assets = group("ASSET");
    const liabilities = group("LIABILITY");
    const equity = group("EQUITY");

    // Retained earnings as-of `end` = cumulative net income since
    // inception (sum of INCOME credits-debits) minus cumulative
    // expenses (sum of EXPENSE debits-credits). Without this, the
    // balance sheet never ties out — assets reflect cash earned from
    // operations but equity has nowhere to absorb it.
    let retainedEarnings = 0;
    for (const acc of accounts) {
      const s = sumMap.get(acc.id);
      if (!s) continue;
      const debit = toNumber(s._sum.debit);
      const credit = toNumber(s._sum.credit);
      if (acc.type === AccountType.INCOME) retainedEarnings += credit - debit;
      else if (acc.type === AccountType.EXPENSE) retainedEarnings -= debit - credit;
    }
    retainedEarnings = round2(retainedEarnings);
    if (Math.abs(retainedEarnings) > 0.01) {
      equity.accounts.push({ name: "Retained Earnings", balance: retainedEarnings });
      equity.total = round2(equity.total + retainedEarnings);
    }

    return {
      asOf: end.toISOString().slice(0, 10),
      assets,
      liabilities,
      equity,
    };
  }

  async trialBalance(from?: string, to?: string) {
    const { end } = this.getPeriod(from, to);

    const accounts = await this.prisma.chartAccount.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    });

    const sums = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journal: { date: { lte: end } } },
      _sum: { debit: true, credit: true },
    });
    const sumMap = new Map(sums.map((s) => [s.accountId, s]));

    const rows = accounts.map((acc) => {
      const s = sumMap.get(acc.id);
      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit: round2(toNumber(s?._sum.debit)),
        credit: round2(toNumber(s?._sum.credit)),
      };
    });

    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));

    return {
      asOf: end.toISOString().slice(0, 10),
      accounts: rows,
      totalDebit,
      totalCredit,
    };
  }

  async cashFlow(from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    const [inflows, outflows, banks, priorInflows, priorOutflows] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { type: "RECEIVED", paymentDate: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { type: "MADE", paymentDate: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.bankAccount.findMany({
        select: { openingBalance: true },
      }),
      // Payments before the period — feed the opening balance so the
      // statement reflects cash on hand at `start`, not just bank
      // accounts' all-time opening figure.
      this.prisma.payment.aggregate({
        where: { type: "RECEIVED", paymentDate: { lt: start } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { type: "MADE", paymentDate: { lt: start } },
        _sum: { amount: true },
      }),
    ]);

    const inflowTotal = round2(toNumber(inflows._sum.amount));
    const outflowTotal = round2(toNumber(outflows._sum.amount));
    const operatingNet = round2(inflowTotal - outflowTotal);

    // Opening cash = baseline (sum of bank-account opening balances) +
    // all receipts before `start` − all disbursements before `start`.
    // Closing cash is then opening + period net, so the report ties
    // out internally even when the requested period is not the whole
    // ledger lifetime.
    const baselineCash = banks.reduce((s, b) => s + toNumber(b.openingBalance), 0);
    const openingBalance = round2(
      baselineCash + toNumber(priorInflows._sum.amount) - toNumber(priorOutflows._sum.amount),
    );
    const closingBalance = round2(openingBalance + operatingNet);
    const netChange = round2(closingBalance - openingBalance);

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      operating: {
        inflows: [{ name: "Customer Payments", amount: inflowTotal }],
        outflows: [{ name: "Vendor Payments", amount: outflowTotal }],
        net: operatingNet,
      },
      investing: { net: 0 },
      financing: { net: 0 },
      netChange,
      openingBalance,
      closingBalance,
    };
  }

  private bucketsOf() {
    return [
      { label: "Current", min: 0, max: 0 },
      { label: "1-30 days", min: 1, max: 30 },
      { label: "31-60 days", min: 31, max: 60 },
      { label: "61-90 days", min: 61, max: 90 },
      { label: "90+ days", min: 91, max: null as number | null },
    ];
  }

  private daysBetween(a: Date, b: Date): number {
    const MS = 1000 * 60 * 60 * 24;
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.floor((da - db) / MS);
  }

  async arAging(from?: string, to?: string) {
    const { end } = this.getPeriod(from, to);

    const invoices = await this.prisma.invoice.findMany({
      // Only invoices that existed by the report date — without this,
      // historical AR aging includes invoices created after `end`.
      where: {
        status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] },
        createdAt: { lte: end },
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        dueDate: true,
        client: { select: { companyName: true } },
      },
    });

    const buckets = this.bucketsOf().map((b) => ({
      ...b,
      invoices: [] as Array<{
        id: string;
        invoiceNumber: string;
        clientName: string;
        total: number;
        dueDate: string;
        daysOverdue: number;
      }>,
      total: 0,
    }));

    for (const inv of invoices) {
      const daysOverdue = Math.max(0, this.daysBetween(end, inv.dueDate));
      const bucket = buckets.find(
        (b) => daysOverdue >= b.min && (b.max === null || daysOverdue <= b.max),
      );
      if (!bucket) continue;
      const total = round2(toNumber(inv.total));
      bucket.invoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client?.companyName ?? "",
        total,
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        daysOverdue,
      });
      bucket.total = round2(bucket.total + total);
    }

    const grandTotal = round2(buckets.reduce((s, b) => s + b.total, 0));

    return {
      asOf: end.toISOString().slice(0, 10),
      buckets,
      grandTotal,
    };
  }

  async apAging(from?: string, to?: string) {
    const { end } = this.getPeriod(from, to);

    const bills = await this.prisma.bill.findMany({
      // Only bills that existed by the report date — same fix as AR
      // aging; without this, future-created bills inflate historical
      // AP buckets.
      where: {
        status: { notIn: [BillStatus.PAID, BillStatus.VOID] },
        createdAt: { lte: end },
      },
      select: {
        id: true,
        billNumber: true,
        total: true,
        dueDate: true,
        vendor: { select: { companyName: true } },
      },
    });

    const buckets = this.bucketsOf().map((b) => ({
      ...b,
      bills: [] as Array<{
        id: string;
        billNumber: string;
        vendorName: string;
        total: number;
        dueDate: string;
        daysOverdue: number;
      }>,
      total: 0,
    }));

    for (const bill of bills) {
      const daysOverdue = Math.max(0, this.daysBetween(end, bill.dueDate));
      const bucket = buckets.find(
        (b) => daysOverdue >= b.min && (b.max === null || daysOverdue <= b.max),
      );
      if (!bucket) continue;
      const total = round2(toNumber(bill.total));
      bucket.bills.push({
        id: bill.id,
        billNumber: bill.billNumber,
        vendorName: bill.vendor?.companyName ?? "",
        total,
        dueDate: bill.dueDate.toISOString().slice(0, 10),
        daysOverdue,
      });
      bucket.total = round2(bucket.total + total);
    }

    const grandTotal = round2(buckets.reduce((s, b) => s + b.total, 0));

    return {
      asOf: end.toISOString().slice(0, 10),
      buckets,
      grandTotal,
    };
  }

  async taxSummary(from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    const [collectedItems, paidItems] = await Promise.all([
      this.prisma.invoiceItem.findMany({
        where: {
          taxRateId: { not: null },
          invoice: { createdAt: { gte: start, lte: end } },
        },
        select: {
          quantity: true,
          price: true,
          taxAmount: true,
          taxRate: { select: { id: true, name: true, rate: true } },
        },
      }),
      this.prisma.billItem.findMany({
        where: {
          taxRateId: { not: null },
          bill: { createdAt: { gte: start, lte: end } },
        },
        select: {
          quantity: true,
          price: true,
          taxAmount: true,
          taxRate: { select: { id: true, name: true, rate: true } },
        },
      }),
    ]);

    type Agg = { taxRate: string; rate: number; taxableAmount: number; taxAmount: number };
    const aggregate = (items: typeof collectedItems): Agg[] => {
      const map = new Map<string, Agg>();
      for (const it of items) {
        if (!it.taxRate) continue;
        const key = it.taxRate.id;
        const taxable = toNumber(it.quantity) * toNumber(it.price);
        const existing = map.get(key) ?? {
          taxRate: it.taxRate.name,
          rate: toNumber(it.taxRate.rate),
          taxableAmount: 0,
          taxAmount: 0,
        };
        existing.taxableAmount += taxable;
        existing.taxAmount += toNumber(it.taxAmount);
        map.set(key, existing);
      }
      return Array.from(map.values()).map((r) => ({
        ...r,
        taxableAmount: round2(r.taxableAmount),
        taxAmount: round2(r.taxAmount),
      }));
    };

    const collected = aggregate(collectedItems);
    const paid = aggregate(paidItems);
    const netPayable = round2(
      collected.reduce((s, r) => s + r.taxAmount, 0) - paid.reduce((s, r) => s + r.taxAmount, 0),
    );

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      collected,
      paid,
      netPayable,
    };
  }

  async salesByCustomer(from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    const invoices = await this.prisma.invoice.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        clientId: true,
        total: true,
        status: true,
        client: { select: { companyName: true } },
        allocations: { select: { amount: true } },
      },
    });

    const map = new Map<
      string,
      { clientId: string; clientName: string; invoiceCount: number; totalSales: number; totalPaid: number; outstanding: number }
    >();

    for (const inv of invoices) {
      const key = inv.clientId;
      const existing = map.get(key) ?? {
        clientId: inv.clientId,
        clientName: inv.client?.companyName ?? "",
        invoiceCount: 0,
        totalSales: 0,
        totalPaid: 0,
        outstanding: 0,
      };
      const total = toNumber(inv.total);
      const paid = inv.allocations.reduce((s, a) => s + toNumber(a.amount), 0);
      existing.invoiceCount += 1;
      existing.totalSales += total;
      existing.totalPaid += paid;
      existing.outstanding += Math.max(0, total - paid);
      map.set(key, existing);
    }

    const customers = Array.from(map.values())
      .map((c) => ({
        ...c,
        totalSales: round2(c.totalSales),
        totalPaid: round2(c.totalPaid),
        outstanding: round2(c.outstanding),
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      customers,
    };
  }

  async expensesByCategory(from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    const groups = await this.prisma.expense.groupBy({
      by: ["category"],
      where: { spentAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categories = groups
      .map((g) => ({
        category: g.category,
        count: g._count._all,
        total: round2(toNumber(g._sum.amount)),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      categories,
    };
  }

  async customerStatement(clientId: string, from?: string, to?: string) {
    const { start, end } = this.getPeriod(from, to);

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, companyName: true, contactPerson: true, email: true },
    });
    if (!client) throw new NotFoundException("Client not found");

    // Pull invoices + payments in-window AND prior. Invoices include
    // `paidAt` and `status` so we can synthesise a credit for the
    // legacy "marked PAID without a payment record" case — without
    // that, the statement overstates what the client owes.
    const [invoicesAll, paymentsAll] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { clientId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
          createdAt: true,
          paidAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.payment.findMany({
        where: { clientId, type: "RECEIVED" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
          allocations: { select: { invoiceId: true } },
        },
        orderBy: { paymentDate: "asc" },
      }),
    ]);

    // Set of invoice IDs that have at least one payment record applied
    // (via the PaymentAllocation join). Used to decide if we need to
    // synthesise a "PAID by status" credit for legacy invoices that
    // were flipped to PAID without going through the Payments flow.
    const paidByPaymentRecord = new Set(
      paymentsAll.flatMap((p) => p.allocations.map((a) => a.invoiceId)),
    );

    // Synthetic credits: each invoice with status=PAID that has NO
    // explicit Payment row gets a virtual settlement equal to its
    // total, dated `paidAt` (falling back to invoice creation date).
    // This corrects the legacy state where invoices were toggled to
    // PAID directly without going through the Payments flow.
    const syntheticPayments = invoicesAll
      .filter((i) => i.status === "PAID" && !paidByPaymentRecord.has(i.id))
      .map((i) => ({
        id: `synthetic-${i.id}`,
        paymentNumber: `(Marked paid)`,
        amount: toNumber(i.total),
        paymentDate: i.paidAt ?? i.createdAt,
        method: "ADJUSTMENT" as const,
        reference: i.invoiceNumber,
        invoiceId: i.id,
        synthetic: true,
      }));

    const allPaymentsCombined = [
      ...paymentsAll.map((p) => ({ ...p, synthetic: false as const })),
      ...syntheticPayments,
    ];

    const inWindow = <T extends { paymentDate?: Date | null; createdAt?: Date | null }>(d: T, key: "paymentDate" | "createdAt") => {
      const v = d[key];
      if (!v) return false;
      return v >= start && v <= end;
    };
    const prior = <T extends { paymentDate?: Date | null; createdAt?: Date | null }>(d: T, key: "paymentDate" | "createdAt") => {
      const v = d[key];
      if (!v) return false;
      return v < start;
    };

    const invoicesPeriod = invoicesAll.filter((i) => inWindow(i, "createdAt"));
    const paymentsPeriod = allPaymentsCombined.filter((p) => inWindow(p, "paymentDate"));
    const priorInvoicesTotal = invoicesAll.filter((i) => prior(i, "createdAt")).reduce((s, i) => s + toNumber(i.total), 0);
    const priorPaymentsTotal = allPaymentsCombined.filter((p) => prior(p, "paymentDate")).reduce((s, p) => s + toNumber(p.amount), 0);

    const openingBalance = round2(priorInvoicesTotal - priorPaymentsTotal);
    const invoicedInPeriod = invoicesPeriod.reduce((s, i) => s + toNumber(i.total), 0);
    const receivedInPeriod = paymentsPeriod.reduce((s, p) => s + toNumber(p.amount), 0);
    const closingBalance = round2(openingBalance + invoicedInPeriod - receivedInPeriod);

    return {
      client,
      asOf: end.toISOString().slice(0, 10),
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      invoices: invoicesPeriod.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        total: round2(toNumber(i.total)),
        status: i.status,
        dueDate: i.dueDate.toISOString().slice(0, 10),
        date: i.createdAt.toISOString().slice(0, 10),
      })),
      payments: paymentsPeriod.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        amount: round2(toNumber(p.amount)),
        paymentDate: p.paymentDate.toISOString().slice(0, 10),
        method: p.method,
        reference: p.reference,
        synthetic: p.synthetic,
      })),
      openingBalance,
      closingBalance,
    };
  }
}
