import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BankTxnType, CreditNoteStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { AutoPostService } from "../finance/auto-post.service";
import { nextNumber } from "../_shared/auto-number.util";
import { ApplyCreditNoteDto, CreateCreditNoteDto, CreditNoteLineDto, UpdateCreditNoteDto } from "./dto/credit-note.dto";

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
  ) {}

  private baseInclude = {
    client: true,
    invoice: true,
    createdBy: true,
    items: { include: { item: true, taxRate: true } },
  };

  private async computeLines(items: CreditNoteLineDto[]) {
    const taxIds = Array.from(new Set(items.map((i) => i.taxRateId).filter(Boolean))) as string[];
    const taxRates = taxIds.length
      ? await this.prisma.taxRate.findMany({ where: { id: { in: taxIds } } })
      : [];
    const taxMap = new Map(taxRates.map((t) => [t.id, Number(t.rate)]));

    let subtotal = 0;
    let taxAmount = 0;
    const lines = items.map((i) => {
      const lineSubtotal = i.quantity * i.price;
      const rate = i.taxRateId ? taxMap.get(i.taxRateId) ?? 0 : 0;
      const lineTax = lineSubtotal * (rate / 100);
      subtotal += lineSubtotal;
      taxAmount += lineTax;
      return {
        itemId: i.itemId,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        taxRateId: i.taxRateId,
        taxAmount: lineTax,
        total: lineSubtotal + lineTax,
      };
    });
    return { lines, subtotal, taxAmount };
  }

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.creditNote.findMany({
        include: this.baseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.creditNote.count(),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const cn = await this.prisma.creditNote.findUnique({ where: { id }, include: this.baseInclude });
    if (!cn) throw new NotFoundException("Credit note not found.");
    return cn;
  }

  async create(createdById: string, dto: CreateCreditNoteDto) {
    const settings = await this.prisma.organizationSettings.findFirst();
    const prefix = settings?.creditNotePrefix ?? "CN-";
    const creditNumber = await nextNumber(this.prisma, "creditNote", prefix);
    const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
    const total = subtotal + taxAmount;

    return this.prisma.creditNote.create({
      data: {
        creditNumber,
        clientId: dto.clientId,
        invoiceId: dto.invoiceId,
        issueDate: new Date(dto.issueDate),
        reason: dto.reason,
        subtotal,
        taxAmount,
        total,
        createdById,
        items: { create: lines },
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateCreditNoteDto) {
    const updates: any = {
      clientId: dto.clientId,
      invoiceId: dto.invoiceId,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      reason: dto.reason,
    };
    let computedLines: Awaited<ReturnType<typeof this.computeLines>> | null = null;
    if (dto.items) {
      computedLines = await this.computeLines(dto.items);
      updates.subtotal = computedLines.subtotal;
      updates.taxAmount = computedLines.taxAmount;
      updates.total = computedLines.subtotal + computedLines.taxAmount;
    }
    // Wrap delete + create + update in one transaction so a failed update
    // can't leave the credit note with no line items but stale totals.
    return this.prisma.$transaction(async (tx) => {
      if (computedLines) {
        await tx.creditNoteItem.deleteMany({ where: { creditNoteId: id } });
        updates.items = { create: computedLines.lines };
      }
      return tx.creditNote.update({
        where: { id },
        data: updates,
        include: this.baseInclude,
      });
    });
  }

  async remove(id: string) {
    // Unwind any auto-posted JEs first so the GL doesn't keep ghost
    // entries for a credit note that no longer exists. Each JE's bank
    // mirror needs its delta reversed before we delete it, otherwise
    // bank.currentBalance ends up out of sync.
    const journals = await this.prisma.journalEntry.findMany({
      where: { source: "CREDIT_NOTE", sourceId: { startsWith: `${id}:` } },
      include: { bankTransactions: true },
    });
    for (const je of journals) {
      for (const mirror of je.bankTransactions) {
        const undo = mirror.type === BankTxnType.CREDIT ? -Number(mirror.amount) : Number(mirror.amount);
        await this.prisma.bankAccount.update({
          where: { id: mirror.bankAccountId },
          data: { currentBalance: { increment: new Prisma.Decimal(undo) } },
        });
      }
      await this.prisma.bankTransaction.deleteMany({ where: { journalEntryId: je.id } });
      await this.prisma.journalEntry.delete({ where: { id: je.id } });
    }
    await this.prisma.creditNoteItem.deleteMany({ where: { creditNoteId: id } });
    await this.prisma.creditNote.delete({ where: { id } });
    return { success: true };
  }

  async applyToInvoice(id: string, dto: ApplyCreditNoteDto, actorId?: string) {
    // Race-safe apply: read, compute, and write inside a single transaction
    // so two concurrent applications can't both observe the same
    // amountApplied and silently double-apply credit beyond the note's total.
    const updated = await this.prisma.$transaction(async (tx) => {
      const cn = await tx.creditNote.findUnique({
        where: { id },
        include: this.baseInclude,
      });
      if (!cn) throw new NotFoundException("Credit note not found.");
      const newApplied = (cn.amountApplied as unknown as Prisma.Decimal).plus(dto.amount);
      if (newApplied.gt(cn.total as unknown as Prisma.Decimal)) {
        throw new BadRequestException(
          `Applied amount would exceed credit note total (${cn.total}).`,
        );
      }
      const status: CreditNoteStatus = newApplied.gte(cn.total as unknown as Prisma.Decimal)
        ? CreditNoteStatus.CLOSED
        : CreditNoteStatus.OPEN;
      return tx.creditNote.update({
        where: { id },
        data: { amountApplied: newApplied, status, invoiceId: dto.invoiceId },
        include: this.baseInclude,
      });
    });
    const cn = updated;
    // Post a reversing JE so the GL reflects the refund / reduction.
    // Cash-basis convention: DEBIT Sales Revenue (reverses recognised
    // revenue), CREDIT Cash. If the original invoice was unpaid, the
    // company hasn't received the cash to credit — but the reversal
    // still gives an accurate "we owe this back" snapshot. HR can
    // override / delete the JE later if needed.
    if (actorId && dto.amount > 0) {
      try {
        await this.autoPost.postCreditNoteApplication({
          creditNoteId: id,
          invoiceId: dto.invoiceId,
          amount: dto.amount,
          createdById: actorId,
          description: `Credit note ${cn.creditNumber} applied to invoice`,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[CreditNote.apply] auto-post failed", id, err);
      }
    }
    return updated;
  }
}
