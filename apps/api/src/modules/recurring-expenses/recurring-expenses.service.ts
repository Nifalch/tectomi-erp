import { Injectable, NotFoundException } from "@nestjs/common";
import { BankTxnType, ExpenseFrequency, PaymentType, Prisma, RecurringExpense } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AutoPostService } from "../finance/auto-post.service";
import { nextNumber } from "../_shared/auto-number.util";
import { CreateRecurringExpenseDto, UpdateRecurringExpenseDto } from "./dto/recurring-expense.dto";

/**
 * Manages templates for recurring outflows (rent, SaaS subs, utilities).
 * Each cycle, `generateDue` turns active templates into actual Payment
 * rows with type=MADE, which then trip the normal autoPost.postPayment
 * hook so the GL + bank reconcile on their own. Templates themselves
 * never touch the GL.
 */
@Injectable()
export class RecurringExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
  ) {}

  private baseInclude = {
    vendor: true,
    bankAccount: true,
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  };

  async findAll() {
    const data = await this.prisma.recurringExpense.findMany({
      include: this.baseInclude,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    // Enrich each row with the next-due date so the UI doesn't have to
    // recompute the same logic client-side. Cheap — pure date math.
    return data.map((r) => ({ ...r, nextDueDate: nextDueDate(r) }));
  }

  async findOne(id: string) {
    const row = await this.prisma.recurringExpense.findUnique({
      where: { id },
      include: { ...this.baseInclude, generatedPayments: { orderBy: { paymentDate: "desc" } } },
    });
    if (!row) throw new NotFoundException("Recurring expense not found");
    return { ...row, nextDueDate: nextDueDate(row) };
  }

  async create(createdById: string, dto: CreateRecurringExpenseDto) {
    return this.prisma.recurringExpense.create({
      data: {
        title: dto.title,
        category: dto.category,
        vendorId: dto.vendorId,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        bankAccountId: dto.bankAccountId,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isActive: dto.isActive ?? true,
        notes: dto.notes,
        createdById,
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateRecurringExpenseDto) {
    await this.findOne(id);
    return this.prisma.recurringExpense.update({
      where: { id },
      data: {
        title: dto.title,
        category: dto.category,
        vendorId: dto.vendorId,
        amount: dto.amount != null ? new Prisma.Decimal(dto.amount) : undefined,
        method: dto.method,
        bankAccountId: dto.bankAccountId,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive,
        notes: dto.notes,
      },
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Generated Payments stay (they're real cash movements that already
    // hit the GL). recurringExpenseId is just set null via the FK rule.
    await this.prisma.recurringExpense.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Convert every active template whose next-due date is on/before today
   * into a real Payment + GL entry. Idempotent through
   * `lastGeneratedFor` — re-running on the same day is a no-op.
   * Returns the list of payments that were created.
   */
  async generateDue(createdById: string) {
    const today = startOfDayUTC(new Date());
    const templates = await this.prisma.recurringExpense.findMany({
      where: { isActive: true },
      include: this.baseInclude,
    });
    const created: Array<{ paymentId: string; templateId: string; periodKey: string }> = [];
    for (const t of templates) {
      // Generate every cycle that's already due (catches up if the user
      // skipped a month). Capped at 24 cycles per template to avoid
      // pathological loops on misconfigured rows.
      for (let i = 0; i < 24; i++) {
        const due = nextDueDate(t);
        if (!due || due > today) break;
        if (t.endDate && due > t.endDate) break;
        const periodKey = periodAnchor(t.frequency, due);
        const paymentNumber = await nextNumber(this.prisma, "payment", "PAY-");
        // If the template doesn't specify a bank, fall back to the primary
        // bank — otherwise the JE would post a cash credit but no bank
        // would move, leaving mainBalance vs glBalance out of sync.
        const targetBankId = t.bankAccountId ?? (await this.autoPost.getPrimaryBank())?.id ?? null;
        const payment = await this.prisma.payment.create({
          data: {
            paymentNumber,
            type: PaymentType.MADE,
            amount: t.amount,
            paymentDate: due,
            method: t.method,
            notes: `${t.title} (auto from recurring expense)`,
            vendorId: t.vendorId,
            bankAccountId: targetBankId,
            expenseCategory: t.category,
            recurringExpenseId: t.id,
            createdById,
          },
        });
        // Mirror cash side so bank.currentBalance stays in lockstep with
        // the GL's Cash account. Same pattern as PaymentsService.create.
        if (targetBankId) {
          await this.prisma.bankTransaction.create({
            data: {
              bankAccountId: targetBankId,
              date: due,
              amount: t.amount,
              type: BankTxnType.DEBIT,
              description: `Recurring expense: ${t.title}`,
              paymentId: payment.id,
            },
          });
          await this.prisma.bankAccount.update({
            where: { id: targetBankId },
            data: { currentBalance: { decrement: t.amount } },
          });
        }
        // Auto-post the JE through the existing payment hook.
        try {
          await this.autoPost.postPayment(payment.id, createdById);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[RecurringExpense] auto-post failed", payment.id, err);
        }
        // Mark this cycle as generated so the next iteration moves
        // forward (and re-runs on later days are no-ops).
        t.lastGeneratedFor = periodKey;
        await this.prisma.recurringExpense.update({
          where: { id: t.id },
          data: { lastGeneratedFor: periodKey },
        });
        created.push({ paymentId: payment.id, templateId: t.id, periodKey: periodKey.toISOString() });
      }
    }
    return { generated: created.length, payments: created };
  }
}

// All date math runs in UTC so the dates stored on Prisma's @db.Date
// columns don't shift across timezones. Doing this in local time bites us
// on servers in IST: local midnight Jan 1 = Dec 31 18:30 UTC, and Prisma
// truncates to the date column → wrong day stored.

/** Snap a date to UTC start-of-day. */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** UTC-safe constructor for a YYYY-MM-DD date. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * Anchor a date to the canonical "first day of the cycle" (UTC) for
 * storage in lastGeneratedFor. Monthly → first of month, quarterly →
 * first of quarter start, yearly → Jan 1, half-yearly → Jan 1 / Jul 1.
 */
function periodAnchor(freq: ExpenseFrequency, date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (freq === ExpenseFrequency.MONTHLY) return utcDate(year, month, 1);
  if (freq === ExpenseFrequency.QUARTERLY) return utcDate(year, Math.floor(month / 3) * 3, 1);
  if (freq === ExpenseFrequency.HALF_YEARLY) return utcDate(year, month < 6 ? 0 : 6, 1);
  return utcDate(year, 0, 1);
}

/**
 * Compute the next due Date for a recurring template. Returns null if
 * the template is past its endDate. The math is deterministic and only
 * depends on the template's `startDate`, `frequency`, `dayOfMonth`, and
 * the previously-generated period anchor.
 */
export function nextDueDate(t: RecurringExpense): Date | null {
  const start = startOfDayUTC(t.startDate);
  // If we've never generated, the next due is the first cycle on/after start.
  const baseAnchor = t.lastGeneratedFor
    ? advanceAnchor(t.frequency, t.lastGeneratedFor)
    : periodAnchor(t.frequency, start);
  // Inside the cycle, the actual due date is the dayOfMonth (clamped to
  // the cycle's month-end if dayOfMonth is too large for a short month).
  const year = baseAnchor.getUTCFullYear();
  const month = baseAnchor.getUTCMonth();
  // Day count for THIS month: day 0 of next month = last day of this month.
  const monthDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const due = utcDate(year, month, Math.min(t.dayOfMonth, monthDays));
  // For the first cycle: don't generate before startDate.
  if (!t.lastGeneratedFor && due < start) {
    return nextDueDate({ ...t, lastGeneratedFor: baseAnchor });
  }
  if (t.endDate && due > startOfDayUTC(t.endDate)) return null;
  return due;
}

function advanceAnchor(freq: ExpenseFrequency, anchor: Date): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  if (freq === ExpenseFrequency.MONTHLY) return utcDate(year, month + 1, 1);
  if (freq === ExpenseFrequency.QUARTERLY) return utcDate(year, month + 3, 1);
  if (freq === ExpenseFrequency.HALF_YEARLY) return utcDate(year, month + 6, 1);
  return utcDate(year + 1, 0, 1);
}
