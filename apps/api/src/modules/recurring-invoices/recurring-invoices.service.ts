import { Injectable, NotFoundException } from "@nestjs/common";
import { Frequency, InvoiceStatus, RecurringStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { advanceMonth } from "../../common/util/date.util";
import { CreateRecurringInvoiceDto, RecurringLineDto, UpdateRecurringInvoiceDto } from "./dto/recurring-invoice.dto";

@Injectable()
export class RecurringInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private baseInclude = {
    client: true,
    project: true,
    createdBy: true,
    items: { include: { item: true, taxRate: true } },
  };

  private advance(date: Date, frequency: Frequency): Date {
    const d = new Date(date);
    switch (frequency) {
      case Frequency.DAILY:
        d.setDate(d.getDate() + 1);
        break;
      case Frequency.WEEKLY:
        d.setDate(d.getDate() + 7);
        break;
      case Frequency.MONTHLY:
        // Use clamp-on-overflow helper — bare setMonth(+1) on Jan 31 lands
        // on Mar 3 and silently skips February's invoice.
        advanceMonth(d, 1);
        break;
      case Frequency.QUARTERLY:
        advanceMonth(d, 3);
        break;
      case Frequency.YEARLY:
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    return d;
  }

  private async computeLines(items: RecurringLineDto[]) {
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
        total: lineSubtotal + lineTax,
      };
    });
    return { lines, subtotal, taxAmount };
  }

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.recurringInvoice.findMany({
        include: this.baseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.recurringInvoice.count(),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const r = await this.prisma.recurringInvoice.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!r) throw new NotFoundException("Recurring invoice not found.");
    return r;
  }

  async create(createdById: string, dto: CreateRecurringInvoiceDto) {
    const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
    const total = subtotal + taxAmount;
    const startDate = new Date(dto.startDate);
    return this.prisma.recurringInvoice.create({
      data: {
        name: dto.name,
        clientId: dto.clientId,
        projectId: dto.projectId,
        frequency: dto.frequency,
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        nextRunDate: startDate,
        notes: dto.notes,
        subtotal,
        taxAmount,
        total,
        createdById,
        items: { create: lines },
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateRecurringInvoiceDto) {
    const updates: any = {
      name: dto.name,
      clientId: dto.clientId,
      projectId: dto.projectId,
      frequency: dto.frequency,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      notes: dto.notes,
    };
    if (dto.items) {
      const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
      updates.subtotal = subtotal;
      updates.taxAmount = taxAmount;
      updates.total = subtotal + taxAmount;
      updates.items = { create: lines };
      // deleteMany + update must be atomic — a failed update otherwise leaves
      // the recurring template with zero items but stale totals.
      return this.prisma.$transaction(async (tx) => {
        await tx.recurringInvoiceItem.deleteMany({ where: { recurringInvoiceId: id } });
        return tx.recurringInvoice.update({
          where: { id },
          data: updates,
          include: this.baseInclude,
        });
      });
    }
    return this.prisma.recurringInvoice.update({
      where: { id },
      data: updates,
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    await this.prisma.recurringInvoiceItem.deleteMany({ where: { recurringInvoiceId: id } });
    await this.prisma.recurringInvoice.delete({ where: { id } });
    return { success: true };
  }

  pause(id: string) {
    return this.prisma.recurringInvoice.update({ where: { id }, data: { status: RecurringStatus.PAUSED } });
  }
  resume(id: string) {
    return this.prisma.recurringInvoice.update({ where: { id }, data: { status: RecurringStatus.ACTIVE } });
  }
  end(id: string) {
    return this.prisma.recurringInvoice.update({ where: { id }, data: { status: RecurringStatus.ENDED } });
  }

  async runDue() {
    const today = new Date();
    const due = await this.prisma.recurringInvoice.findMany({
      where: {
        status: RecurringStatus.ACTIVE,
        nextRunDate: { lte: today },
      },
      include: { items: true },
    });

    const created: string[] = [];
    const settings = await this.prisma.organizationSettings.findFirst();
    const invoicePrefix = settings?.invoicePrefix ?? "INV-";

    for (const r of due) {
      // Recompute totals once (read-only, fine outside the transaction).
      const lineDtos: RecurringLineDto[] = r.items.map((i) => ({
        itemId: i.itemId ?? undefined,
        description: i.description,
        quantity: Number(i.quantity),
        price: Number(i.price),
        taxRateId: i.taxRateId ?? undefined,
      }));
      const { subtotal, taxAmount } = await this.computeLines(lineDtos);
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + (settings?.paymentTerms ?? 30));
      const next = this.advance(r.nextRunDate, r.frequency);
      const shouldEnd = r.endDate && next > r.endDate;

      // Wrap invoice creation + template update in one transaction so a
      // failure mid-write can't leave the template "already advanced" with
      // no invoice (or vice versa). On a number collision (race with a
      // parallel manual invoice create), retry once with the bumped count.
      const invoice = await this.runWithNumberRetry(async (tx) => {
        const invoiceCount = await tx.invoice.count();
        const invoiceNumber = `${invoicePrefix}${String(invoiceCount + 1).padStart(4, "0")}`;
        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            clientId: r.clientId,
            projectId: r.projectId ?? undefined,
            amount: subtotal,
            tax: taxAmount,
            total: subtotal + taxAmount,
            status: InvoiceStatus.DRAFT,
            dueDate,
            createdById: r.createdById,
            items: {
              create: r.items.map((it) => {
                const qty = Number(it.quantity);
                const price = Number(it.price);
                return {
                  itemId: it.itemId ?? undefined,
                  description: it.description,
                  quantity: qty,
                  price,
                  taxRateId: it.taxRateId ?? undefined,
                  taxAmount: 0,
                  total: qty * price,
                };
              }),
            },
          },
        });
        await tx.recurringInvoice.update({
          where: { id: r.id },
          data: {
            lastRunDate: today,
            nextRunDate: next,
            status: shouldEnd ? RecurringStatus.ENDED : r.status,
          },
        });
        return created;
      });

      created.push(invoice.id);
    }

    return { generated: created.length, invoiceIds: created };
  }

  /**
   * Run a write transaction that mints an auto-incrementing invoice number.
   * If a parallel writer wins the count() race and the unique constraint
   * on `invoiceNumber` fires (P2002), retry once — by then our new
   * `count()` reads include the parallel write's row, so the next number
   * is fresh.
   */
  private async runWithNumberRetry<T>(
    fn: (tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        return await this.prisma.$transaction(fn);
      }
      throw err;
    }
  }
}
