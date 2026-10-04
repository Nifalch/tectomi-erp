import { Injectable, NotFoundException } from "@nestjs/common";
import { BankTxnType, BillStatus, InvoiceStatus, PaymentType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { nextNumber } from "../_shared/auto-number.util";
import { AutoPostService } from "../finance/auto-post.service";
import { CreatePaymentDto, UpdatePaymentDto } from "./dto/payment.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
  ) {}

  private baseInclude = {
    client: true,
    vendor: true,
    bankAccount: true,
    allocations: { include: { invoice: true, bill: true } },
  };

  async findAll(query: PaginationDto & { type?: PaymentType }) { // ListPaymentsDto extends PaginationDto, same shape at runtime
    const { skip, take, page, pageSize } = getPagination(query);
    // The new /expenses page filters with ?type=MADE so we list only
    // outflows. Default (no filter) preserves existing /payments behaviour.
    const where = query.type ? { type: query.type } : undefined;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: this.baseInclude,
        orderBy: { paymentDate: "desc" },
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!payment) throw new NotFoundException("Payment not found.");
    return payment;
  }

  async create(createdById: string, dto: CreatePaymentDto) {
    const paymentNumber = await nextNumber(this.prisma, "payment", "PAY-");
    const allocations = dto.allocations ?? [];

    // Everything that has to be consistent — the payment row, allocations,
    // invoice/bill status flips, and the bank ledger move — runs in one
    // transaction. Without this, two concurrent RECEIVED payments for the
    // same invoice could each read a stale allocation total before either
    // commits, and neither would flip the invoice to PAID.
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          paymentNumber,
          type: dto.type,
          amount: dto.amount,
          paymentDate: new Date(dto.paymentDate),
          method: dto.method,
          reference: dto.reference,
          notes: dto.notes,
          clientId: dto.clientId,
          vendorId: dto.vendorId,
          bankAccountId: dto.bankAccountId,
          expenseCategory: dto.expenseCategory,
          recurringExpenseId: dto.recurringExpenseId,
          createdById,
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId,
              billId: a.billId,
              amount: a.amount,
            })),
          },
        },
        include: this.baseInclude,
      });

      for (const a of allocations) {
        if (a.invoiceId && dto.type === PaymentType.RECEIVED) {
          const invoice = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
          if (invoice) {
            const allocs = await tx.paymentAllocation.findMany({ where: { invoiceId: a.invoiceId } });
            const totalPaid = allocs.reduce(
              (s, x) => s.plus(x.amount as unknown as Prisma.Decimal),
              new Prisma.Decimal(0),
            );
            if (totalPaid.gte(invoice.total as unknown as Prisma.Decimal)) {
              await tx.invoice.update({
                where: { id: a.invoiceId },
                data: { status: InvoiceStatus.PAID, paidAt: new Date(dto.paymentDate) },
              });
            }
          }
        }
        if (a.billId && dto.type === PaymentType.MADE) {
          const bill = await tx.bill.findUnique({ where: { id: a.billId } });
          if (bill) {
            const newPaid = (bill.amountPaid as unknown as Prisma.Decimal).plus(a.amount);
            let status: BillStatus = bill.status;
            if (newPaid.gte(bill.total as unknown as Prisma.Decimal)) status = BillStatus.PAID;
            else if (newPaid.gt(0)) status = BillStatus.PARTIALLY_PAID;
            await tx.bill.update({
              where: { id: a.billId },
              data: { amountPaid: newPaid, status },
            });
          }
        }
      }

      if (dto.bankAccountId) {
        const txnType: BankTxnType = dto.type === PaymentType.RECEIVED ? BankTxnType.CREDIT : BankTxnType.DEBIT;
        await tx.bankTransaction.create({
          data: {
            bankAccountId: dto.bankAccountId,
            date: new Date(dto.paymentDate),
            amount: dto.amount,
            type: txnType,
            description: `Payment ${paymentNumber}`,
            reference: dto.reference,
            paymentId: created.id,
          },
        });
        // Decimal-safe balance update — going through Number would silently
        // lose precision on large balances or sub-cent values.
        const signedDelta = new Prisma.Decimal(dto.type === PaymentType.RECEIVED ? dto.amount : -dto.amount);
        await tx.bankAccount.update({
          where: { id: dto.bankAccountId },
          data: { currentBalance: { increment: signedDelta } },
        });
      }

      return created;
    });

    // Auto-post to the general ledger. Non-fatal: a failure here logs
    // and doesn't block the payment (the user can re-post later via the
    // backfill endpoint).
    try {
      await this.autoPost.postPayment(payment.id, createdById);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[AutoPost] Failed to post payment", payment.id, err);
    }

    return this.findOne(payment.id);
  }

  async update(id: string, dto: UpdatePaymentDto) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        amount: dto.amount,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        method: dto.method,
        reference: dto.reference,
        notes: dto.notes,
      },
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    const payment = await this.findOne(id);

    // Reverse bill effects
    for (const a of payment.allocations) {
      if (a.billId && payment.type === PaymentType.MADE) {
        const bill = await this.prisma.bill.findUnique({ where: { id: a.billId } });
        if (bill) {
          const newPaid = Math.max(0, Number(bill.amountPaid) - Number(a.amount));
          let status: BillStatus = bill.status;
          if (newPaid === 0) status = BillStatus.OPEN;
          else if (newPaid < Number(bill.total)) status = BillStatus.PARTIALLY_PAID;
          else status = BillStatus.PAID;
          await this.prisma.bill.update({ where: { id: a.billId }, data: { amountPaid: newPaid, status } });
        }
      }
      if (a.invoiceId && payment.type === PaymentType.RECEIVED) {
        const invoice = await this.prisma.invoice.findUnique({ where: { id: a.invoiceId } });
        if (invoice) {
          const otherAllocs = await this.prisma.paymentAllocation.findMany({
            where: { invoiceId: a.invoiceId, paymentId: { not: id } },
          });
          const totalPaid = otherAllocs.reduce((s, x) => s + Number(x.amount), 0);
          if (totalPaid < Number(invoice.total)) {
            await this.prisma.invoice.update({
              where: { id: a.invoiceId },
              data: { status: InvoiceStatus.SENT, paidAt: null },
            });
          }
        }
      }
    }

    // Reverse bank transaction (Decimal-safe — see comment in create()).
    if (payment.bankAccountId) {
      const signedDelta = new Prisma.Decimal(
        payment.type === PaymentType.RECEIVED ? -Number(payment.amount) : Number(payment.amount),
      );
      await this.prisma.bankAccount.update({
        where: { id: payment.bankAccountId },
        data: { currentBalance: { increment: signedDelta } },
      });
      await this.prisma.bankTransaction.deleteMany({ where: { paymentId: id } });
    }

    // Reverse the auto-posted journal entry so the GL doesn't carry a
    // ghost revenue / expense after the Payment row is gone. Done
    // before the Payment delete so the JE's sourceId is still valid
    // for the lookup.
    await this.prisma.journalEntry.deleteMany({
      where: { source: "PAYMENT", sourceId: id },
    });

    await this.prisma.paymentAllocation.deleteMany({ where: { paymentId: id } });
    await this.prisma.payment.delete({ where: { id } });
    return { success: true };
  }
}
