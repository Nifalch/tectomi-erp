import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  AccountSubType,
  AccountType,
  BankTxnType,
  FounderLedgerDirection,
  JournalEntrySource,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * AutoPostService — writes paired JournalEntry/JournalLine rows whenever a
 * financial event happens upstream (a Payment is recorded, a PaySlip
 * marked paid, a FounderLedgerEntry created). Every method is:
 *
 *   - Idempotent. Checks for an existing JournalEntry with the same
 *     (source, sourceId) and skips re-posting. Safe to invoke from
 *     webhook retries, backfill jobs, or duplicate clicks.
 *
 *   - Transactional. Accepts an optional `tx` so callers can include the
 *     auto-post inside a wider `$transaction` (e.g. the payment INSERT and
 *     its journal entry land atomically — either both or neither).
 *
 *   - Lazy-seeding. The first time a system account (Cash, Sales Revenue,
 *     Salary Expense, Founder Capital) is needed, we create it with a
 *     stable `code` and `isSystem=true` so users can rename but not
 *     accidentally delete it.
 *
 * The accounting convention is cash-basis: revenue is recognised on
 * payment receipt, expenses on payment release. We don't track AR/AP as
 * separate accounts because Indian small-services orgs almost always
 * report cash-basis. Switching to accrual would mean adding two more
 * system accounts (AR, AP) and posting JEs on invoice/bill create
 * instead of payment — schema's flexible enough for that change later.
 */

const SYSTEM_ACCOUNTS = {
  CASH: { code: "1000", name: "Cash & Bank", type: AccountType.ASSET, subType: AccountSubType.CASH },
  SALES_REVENUE: { code: "4000", name: "Sales Revenue", type: AccountType.INCOME, subType: AccountSubType.OPERATING_REVENUE },
  SALARY_EXPENSE: { code: "5100", name: "Salary Expense", type: AccountType.EXPENSE, subType: AccountSubType.PAYROLL_EXPENSE },
  GENERAL_EXPENSE: { code: "5000", name: "General Expense", type: AccountType.EXPENSE, subType: AccountSubType.OPERATING_EXPENSE },
  // Founder capital is an OWNER'S EQUITY claim on the business, not a
  // liability — the founder doesn't have a contractual right to be
  // repaid like a vendor or a bank does. Misclassifying it as
  // LIABILITY made the balance sheet stop balancing.
  FOUNDER_PAYABLE: { code: "3100", name: "Founder Capital Account", type: AccountType.EQUITY, subType: AccountSubType.OWNER_EQUITY },
  TAX_PAYABLE: { code: "2100", name: "Tax Payable", type: AccountType.LIABILITY, subType: AccountSubType.TAX_PAYABLE },
} as const;

type SystemAccountKey = keyof typeof SYSTEM_ACCOUNTS;
type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AutoPostService {
  private readonly logger = new Logger(AutoPostService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── System account lookup / seeding ──
  private async getOrCreateSystemAccount(tx: Tx, key: SystemAccountKey) {
    const meta = SYSTEM_ACCOUNTS[key];
    const existing = await tx.chartAccount.findUnique({ where: { code: meta.code } });
    if (existing) return existing;
    return tx.chartAccount.create({
      data: {
        code: meta.code,
        name: meta.name,
        type: meta.type,
        subType: meta.subType,
        isSystem: true,
      },
    });
  }

  // ── Primary bank account ──
  // Returns the BankAccount flagged isPrimary, or the first active bank
  // if no primary is set yet (graceful degradation so a brand-new install
  // still auto-posts somewhere instead of crashing).
  async getPrimaryBank() {
    const primary = await this.prisma.bankAccount.findFirst({
      where: { isPrimary: true, isActive: true },
    });
    if (primary) return primary;
    return this.prisma.bankAccount.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // Flip exactly one BankAccount to primary. Demotes any currently-primary
  // accounts in the same transaction so we always have at-most-one.
  async setPrimaryBank(bankAccountId: string) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!target) throw new BadRequestException("Bank account not found");
      await tx.bankAccount.updateMany({
        where: { isPrimary: true, NOT: { id: bankAccountId } },
        data: { isPrimary: false },
      });
      return tx.bankAccount.update({ where: { id: bankAccountId }, data: { isPrimary: true } });
    });
  }

  // ── Helper: idempotency check + journal-number minting ──
  private async existsFor(tx: Tx, source: JournalEntrySource, sourceId: string) {
    const found = await tx.journalEntry.findFirst({
      where: { source, sourceId },
      select: { id: true },
    });
    return !!found;
  }

  private async nextJournalNumber(tx: Tx): Promise<string> {
    // Sequence is yyyymm-NNNN; collisions across processes are rare for
    // an internal-tool scale, but we retry once if the unique constraint
    // catches us anyway.
    const now = new Date();
    const prefix = `JE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-`;
    const count = await tx.journalEntry.count({ where: { journalNumber: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(4, "0")}`;
  }

  /**
   * Post a paired JE with one DEBIT line and one CREDIT line.
   */
  private async postPair(
    tx: Tx,
    args: {
      date: Date;
      description: string;
      reference?: string;
      source: JournalEntrySource;
      sourceId: string;
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
      createdById: string;
    },
  ) {
    return this.postLines(tx, {
      date: args.date,
      description: args.description,
      reference: args.reference,
      source: args.source,
      sourceId: args.sourceId,
      createdById: args.createdById,
      lines: [
        { accountId: args.debitAccountId, debit: args.amount, credit: 0 },
        { accountId: args.creditAccountId, debit: 0, credit: args.amount },
      ],
    });
  }

  /**
   * Post a JE with N lines. Used for multi-leg entries (e.g. a founder
   * pay slip with a partial draw: DEBIT Salary, CREDIT Cash, CREDIT
   * Founder Payable). Validates that the total debits equal total
   * credits — otherwise we'd silently corrupt the ledger.
   */
  private async postLines(
    tx: Tx,
    args: {
      date: Date;
      description: string;
      reference?: string;
      source: JournalEntrySource;
      sourceId: string;
      createdById: string;
      lines: Array<{ accountId: string; debit: number; credit: number }>;
    },
  ) {
    const totalDebit = args.lines.reduce((acc, l) => acc + l.debit, 0);
    const totalCredit = args.lines.reduce((acc, l) => acc + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `JE unbalanced: debits ${totalDebit} vs credits ${totalCredit}`,
      );
    }
    if (totalDebit <= 0) {
      throw new BadRequestException("JE total must be > 0");
    }
    // Concurrent posters can mint the same `count + 1` journalNumber. If
    // the column has a UNIQUE constraint, one will collide with P2002 —
    // retry a few times with a fresh count before giving up. Even without
    // a UNIQUE constraint the retry is harmless.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const journalNumber = await this.nextJournalNumber(tx);
      try {
        return await tx.journalEntry.create({
          data: {
            journalNumber,
            date: args.date,
            description: args.description,
            reference: args.reference,
            source: args.source,
            sourceId: args.sourceId,
            createdById: args.createdById,
            lines: {
              create: args.lines.map((l, i) => ({
                accountId: l.accountId,
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
                sortOrder: i,
              })),
            },
          },
          include: { lines: true },
        });
      } catch (err) {
        lastErr = err;
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  // ── Hook: Payment (invoice or bill) ──
  /**
   * RECEIVED → DEBIT Cash for the full payment, CREDIT Sales Revenue for
   * the net portion and CREDIT Tax Payable for the tax portion. The split
   * is derived from the invoice allocations: each allocation contributes
   * `amount * (invoice.tax / invoice.total)` to Tax Payable and the rest
   * to revenue. Unallocated cash (no invoice context) falls through to
   * revenue entirely. If no allocations carry tax this collapses back to
   * the original two-line JE.
   *
   * MADE → DEBIT General Expense, CREDIT Cash.
   *
   * Skipped silently if a JE already exists for this paymentId.
   */
  async postPayment(paymentId: string, createdById: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: { include: { invoice: true, bill: true } } },
    });
    if (!payment) return null;
    if (await this.existsFor(db, JournalEntrySource.PAYMENT, paymentId)) return null;

    const cash = await this.getOrCreateSystemAccount(db, "CASH");
    const amount = Number(payment.amount);
    if (payment.type === "RECEIVED") {
      const revenue = await this.getOrCreateSystemAccount(db, "SALES_REVENUE");
      // Split: for every allocation against an invoice with tax, peel
      // off the tax-proportional share. Anything left over (unallocated
      // advance, or invoices with zero tax) goes straight to revenue.
      let taxShare = 0;
      let allocatedCash = 0;
      for (const a of payment.allocations) {
        const inv = a.invoice;
        if (!inv) continue;
        const allocAmt = Number(a.amount);
        allocatedCash += allocAmt;
        const invTotal = Number(inv.total);
        const invTax = Number(inv.tax);
        if (invTotal > 0 && invTax > 0) {
          taxShare += +(allocAmt * (invTax / invTotal)).toFixed(2);
        }
      }
      // Rounding can leave us off by a paisa; clamp to the payment total.
      taxShare = Math.min(taxShare, amount);
      const netRevenue = +(amount - taxShare).toFixed(2);
      const lines: Array<{ accountId: string; debit: number; credit: number }> = [
        { accountId: cash.id, debit: amount, credit: 0 },
      ];
      if (netRevenue > 0) lines.push({ accountId: revenue.id, debit: 0, credit: netRevenue });
      if (taxShare > 0) {
        const taxPayable = await this.getOrCreateSystemAccount(db, "TAX_PAYABLE");
        lines.push({ accountId: taxPayable.id, debit: 0, credit: taxShare });
      }
      return this.postLines(db, {
        date: payment.paymentDate,
        description: `Payment received: ${payment.paymentNumber}`,
        reference: payment.reference ?? undefined,
        source: JournalEntrySource.PAYMENT,
        sourceId: paymentId,
        createdById,
        lines,
      });
    }
    // MADE
    const expense = await this.getOrCreateSystemAccount(db, "GENERAL_EXPENSE");
    return this.postPair(db, {
      date: payment.paymentDate,
      description: `Payment made: ${payment.paymentNumber}`,
      reference: payment.reference ?? undefined,
      source: JournalEntrySource.PAYMENT,
      sourceId: paymentId,
      debitAccountId: expense.id,
      creditAccountId: cash.id,
      amount,
      createdById,
    });
  }

  // ── Cash-side mirroring ──
  /**
   * Write a BankTransaction against the primary bank + update its
   * currentBalance, mirroring the cash-side leg of a JE we just posted.
   * Paid-payment flows manage this themselves (PaymentsService), but
   * payroll, founder-ledger, and any other auto-posters route through
   * here so the primary bank's running balance stays in sync.
   *
   * Idempotency is anchored on `journalEntryId`: if a BankTransaction
   * already references this JE, we skip. This makes the backfill safe
   * to re-run AND lets it fill in mirrors that were skipped earlier
   * (e.g. JE posted before a primary bank existed). Returns the
   * created BankTransaction or null when no primary bank is configured.
   */
  private async mirrorBankTransaction(
    tx: Tx,
    args: {
      journalEntryId: string;
      date: Date;
      type: BankTxnType;
      amount: number;
      description: string;
      reference?: string;
    },
  ) {
    // Already mirrored? Bail.
    const existing = await tx.bankTransaction.findFirst({
      where: { journalEntryId: args.journalEntryId },
      select: { id: true },
    });
    if (existing) return null;

    const primary = await this.getPrimaryBank();
    if (!primary) return null;

    const txn = await tx.bankTransaction.create({
      data: {
        bankAccountId: primary.id,
        journalEntryId: args.journalEntryId,
        date: args.date,
        amount: new Prisma.Decimal(args.amount),
        type: args.type,
        description: args.description,
        reference: args.reference,
      },
    });
    const delta = args.type === BankTxnType.CREDIT ? args.amount : -args.amount;
    await tx.bankAccount.update({
      where: { id: primary.id },
      data: { currentBalance: { increment: new Prisma.Decimal(delta) } },
    });
    return txn;
  }

  // ── Hook: PaySlip mark-paid ──
  /**
   * DEBIT Salary Expense for the full netSalary, CREDIT Cash for the
   * drawn portion, CREDIT Founder Payable for any deferred portion.
   *
   * For non-founders deferredAmount is always 0, so this collapses to a
   * regular two-line JE (Salary / Cash). For founders who compromised
   * salary, the entry is 3-line so:
   *   - the full salary expense lands on the P&L (we did incur the cost),
   *   - cash only moves by the drawn portion (matches what actually left
   *     the bank),
   *   - founder payable grows by the deferred portion (it's owed back).
   *
   * Structured so each side is independently idempotent: find-or-create
   * the JE, then find-or-create the bank mirror anchored on JE.id.
   */
  async postPaySlip(paySlipId: string, createdById: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const slip = await db.paySlip.findUnique({
      where: { id: paySlipId },
      include: { employee: { select: { isFounder: true } } },
    });
    if (!slip) return null;
    if (slip.status !== "PAID") return null;

    const net = Number(slip.netSalary);
    if (net <= 0) return null;
    const drawn = slip.drawnAmount != null ? Number(slip.drawnAmount) : net;
    const deferred = Math.max(0, net - drawn);
    const date = slip.paidAt ?? new Date();
    const description = `Payroll: slip ${slip.id} (${slip.month}/${slip.year})`;

    // Find or create the JE.
    let entry = await db.journalEntry.findFirst({
      where: { source: JournalEntrySource.PAY_SLIP, sourceId: paySlipId },
    });
    if (!entry) {
      const cash = await this.getOrCreateSystemAccount(db, "CASH");
      const salary = await this.getOrCreateSystemAccount(db, "SALARY_EXPENSE");
      const lines: Array<{ accountId: string; debit: number; credit: number }> = [
        // Always expense the full netSalary — that's what we owed for the work done.
        { accountId: salary.id, debit: net, credit: 0 },
      ];
      if (drawn > 0) {
        lines.push({ accountId: cash.id, debit: 0, credit: drawn });
      }
      if (deferred > 0) {
        const founderPayable = await this.getOrCreateSystemAccount(db, "FOUNDER_PAYABLE");
        lines.push({ accountId: founderPayable.id, debit: 0, credit: deferred });
      }
      entry = await this.postLines(db, {
        date,
        description,
        reference: slip.paymentReference ?? undefined,
        source: JournalEntrySource.PAY_SLIP,
        sourceId: paySlipId,
        createdById,
        lines,
      });
    }

    // Mirror only the cash-side leg to the bank — deferred portion never
    // left the bank, so it shouldn't move bank.currentBalance.
    if (drawn > 0) {
      await this.mirrorBankTransaction(db, {
        journalEntryId: entry.id,
        date,
        type: BankTxnType.DEBIT,
        amount: drawn,
        description,
        reference: slip.paymentReference ?? undefined,
      });
    }
    return entry;
  }

  // ── Hook: Credit-note applied to invoice ──
  /**
   * When a credit note is applied to an invoice we reverse part of the
   * recognised revenue. Cash-basis convention: DEBIT Sales Revenue and
   * CREDIT Cash for the applied amount. If the underlying invoice was
   * never paid the company hasn't actually held the cash to credit, but
   * the JE still gives an accurate "we owe this back" snapshot until the
   * refund settles. Idempotent on (CREDIT_NOTE, creditNoteId+invoiceId+amount)
   * via a synthetic sourceId so multiple applications against different
   * invoices each produce their own JE.
   */
  async postCreditNoteApplication(args: {
    creditNoteId: string;
    invoiceId: string;
    amount: number;
    createdById: string;
    description: string;
    date?: Date;
    tx?: Tx;
  }) {
    const db = args.tx ?? this.prisma;
    if (args.amount <= 0) return null;
    const sourceId = `${args.creditNoteId}:${args.invoiceId}:${args.amount}`;
    if (await this.existsFor(db, JournalEntrySource.CREDIT_NOTE, sourceId)) return null;

    const cash = await this.getOrCreateSystemAccount(db, "CASH");
    const revenue = await this.getOrCreateSystemAccount(db, "SALES_REVENUE");
    const date = args.date ?? new Date();
    const journal = await this.postPair(db, {
      date,
      description: args.description,
      source: JournalEntrySource.CREDIT_NOTE,
      sourceId,
      debitAccountId: revenue.id,
      creditAccountId: cash.id,
      amount: args.amount,
      createdById: args.createdById,
    });

    // Mirror to primary bank as a DEBIT (cash going out). Mirror is
    // idempotent on journalEntryId — safe to retry.
    await this.mirrorBankTransaction(db, {
      journalEntryId: journal.id,
      date,
      type: BankTxnType.DEBIT,
      amount: args.amount,
      description: args.description,
    });
    return journal;
  }

  // ── Hook: FounderLedgerEntry ──
  /**
   * Founder loan in / expense reimbursement (CREDIT to founder) →
   *   DEBIT Cash, CREDIT Founder Capital Account.
   * Founder distribution / repayment (DEBIT from founder) →
   *   DEBIT Founder Capital Account, CREDIT Cash.
   */
  async postFounderLedger(entryId: string, createdById: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const entry = await db.founderLedgerEntry.findUnique({ where: { id: entryId } });
    if (!entry) return null;

    const amount = Number(entry.amount);
    const isCredit = entry.direction === FounderLedgerDirection.CREDIT;
    const description = `Founder ledger: ${entry.kind} (${isCredit ? "credit" : "debit"})`;

    // Find or create the JE.
    let journal = await db.journalEntry.findFirst({
      where: { source: JournalEntrySource.FOUNDER_LEDGER, sourceId: entryId },
    });
    if (!journal) {
      const cash = await this.getOrCreateSystemAccount(db, "CASH");
      const founderPayable = await this.getOrCreateSystemAccount(db, "FOUNDER_PAYABLE");
      // CREDIT to founder = the company received something (cash or value)
      // and now owes the founder more → cash up, founder payable up.
      // DEBIT to founder = company paid the founder (distribution / loan
      // repayment) → cash down, founder payable down.
      journal = await this.postPair(db, {
        date: entry.date,
        description,
        reference: entry.reference ?? undefined,
        source: JournalEntrySource.FOUNDER_LEDGER,
        sourceId: entryId,
        debitAccountId: isCredit ? cash.id : founderPayable.id,
        creditAccountId: isCredit ? founderPayable.id : cash.id,
        amount,
        createdById,
      });
    }

    // Mirror to bank: founder credit (loan in / reimbursement) increases
    // cash; founder debit (distribution / repayment) decreases it. Half-
    // day / late-penalty deferrals don't move cash — those are pure
    // ledger-only entries handled by the deferred-amount on PaySlip —
    // so this check skips them.
    if (entry.kind === "LOAN_IN" || entry.kind === "EXPENSE_REIMBURSEMENT" || entry.kind === "DISTRIBUTION" || entry.kind === "REPAYMENT") {
      await this.mirrorBankTransaction(db, {
        journalEntryId: journal.id,
        date: entry.date,
        type: isCredit ? BankTxnType.CREDIT : BankTxnType.DEBIT,
        amount,
        description,
        reference: entry.reference ?? undefined,
      });
    }
    return journal;
  }

  // ── Backfill ──
  /**
   * Self-healing rebuild. Walks every existing Payment, paid PaySlip,
   * and FounderLedgerEntry; re-posts journal entries against the
   * current logic. Wipes existing auto-posted PAY_SLIP and
   * FOUNDER_LEDGER entries (and their cascaded bank mirrors) first so
   * format changes (e.g. the 2-line → 3-line slip refactor) self-heal.
   * PAYMENT entries are incremental — they're never deleted because
   * the Payment row + its bank txn are the canonical source.
   *
   * Bank's currentBalance is unwound for every deleted mirror and
   * rewound by the new mirror, keeping the running total consistent.
   */
  async backfillAll(createdById: string) {
    // 1. Reverse the cash effect of every existing auto-mirror so
    //    currentBalance is in a clean state before re-mirroring.
    //    We explicitly EXCLUDE payment-sourced bank txns (paymentId set):
    //    those are the canonical cash movement written by PaymentsService
    //    and must never be undone or deleted here. Without this guard, if
    //    postPayment is ever extended to also mirror, every payment would
    //    be double-counted on the next backfill.
    const oldMirrors = await this.prisma.bankTransaction.findMany({
      where: { journalEntryId: { not: null }, paymentId: null },
      select: { id: true, bankAccountId: true, type: true, amount: true },
    });
    for (const m of oldMirrors) {
      const undoDelta = m.type === BankTxnType.CREDIT ? -Number(m.amount) : Number(m.amount);
      await this.prisma.bankAccount.update({
        where: { id: m.bankAccountId },
        data: { currentBalance: { increment: new Prisma.Decimal(undoDelta) } },
      });
    }
    // 2. Delete the auto-mirrored bank transactions (excluding payment-
    //    sourced ones) and the JEs that spawned them. We also clear
    //    PAYMENT JEs so format changes (e.g. the tax-split refactor)
    //    self-heal on the next backfill — the Payment row itself is the
    //    canonical source so reposting is safe.
    await this.prisma.bankTransaction.deleteMany({
      where: { journalEntryId: { not: null }, paymentId: null },
    });
    await this.prisma.journalEntry.deleteMany({
      where: {
        source: {
          in: [
            JournalEntrySource.PAYMENT,
            JournalEntrySource.PAY_SLIP,
            JournalEntrySource.FOUNDER_LEDGER,
          ],
        },
      },
    });

    // 3. Re-run the posters. PAYMENT entries are still idempotent on
    //    their own (existsFor check), so re-running this skips already-
    //    posted ones.
    const [payments, slips, ledgerEntries] = await Promise.all([
      this.prisma.payment.findMany({ select: { id: true } }),
      this.prisma.paySlip.findMany({ where: { status: "PAID" }, select: { id: true } }),
      this.prisma.founderLedgerEntry.findMany({ select: { id: true } }),
    ]);
    let paymentsPosted = 0;
    let paySlipsPosted = 0;
    let ledgerPosted = 0;
    for (const p of payments) {
      const r = await this.postPayment(p.id, createdById);
      if (r) paymentsPosted++;
    }
    for (const s of slips) {
      const r = await this.postPaySlip(s.id, createdById);
      if (r) paySlipsPosted++;
    }
    for (const e of ledgerEntries) {
      const r = await this.postFounderLedger(e.id, createdById);
      if (r) ledgerPosted++;
    }
    this.logger.log(
      `Backfill complete — ${paymentsPosted} payments, ${paySlipsPosted} payslips, ${ledgerPosted} founder ledger entries.`,
    );
    return { paymentsPosted, paySlipsPosted, ledgerPosted };
  }
}
