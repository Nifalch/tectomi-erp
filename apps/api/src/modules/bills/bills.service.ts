import { Injectable, NotFoundException } from "@nestjs/common";
import { BillStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { nextNumber } from "../_shared/auto-number.util";
import { BillLineDto, CreateBillDto, UpdateBillDto } from "./dto/bill.dto";

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService) {}

  private async computeLines(items: BillLineDto[]) {
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
      const lineTotal = lineSubtotal + lineTax;
      subtotal += lineSubtotal;
      taxAmount += lineTax;
      return {
        itemId: i.itemId,
        accountId: i.accountId,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        taxRateId: i.taxRateId,
        taxAmount: lineTax,
        total: lineTotal,
      };
    });
    return { lines, subtotal, taxAmount };
  }

  private baseInclude = {
    vendor: true,
    project: true,
    createdBy: true,
    items: { include: { item: true, taxRate: true, account: true } },
    allocations: { include: { payment: true } },
  };

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        include: this.baseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.bill.count(),
    ]);
    const today = new Date();
    const enriched = data.map((b) => {
      if (
        b.status !== BillStatus.PAID &&
        b.status !== BillStatus.VOID &&
        b.status !== BillStatus.DRAFT &&
        Number(b.amountPaid) < Number(b.total) &&
        new Date(b.dueDate) < today
      ) {
        return { ...b, status: BillStatus.OVERDUE };
      }
      return b;
    });
    return {
      data: enriched,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!bill) throw new NotFoundException("Bill not found.");
    return bill;
  }

  async create(createdById: string, dto: CreateBillDto) {
    const settings = await this.prisma.organizationSettings.findFirst();
    const prefix = settings?.billPrefix ?? "BILL-";
    const billNumber = await nextNumber(this.prisma, "bill", prefix);
    const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
    const discountAmount = Math.max(0, Number(dto.discountAmount ?? 0));
    const total = Math.max(0, subtotal + taxAmount - discountAmount);

    return this.prisma.bill.create({
      data: {
        billNumber,
        vendorId: dto.vendorId,
        projectId: dto.projectId || null,
        issueDate: new Date(dto.issueDate),
        dueDate: new Date(dto.dueDate),
        subtotal,
        taxAmount,
        discountAmount,
        total,
        notes: dto.notes,
        terms: dto.terms,
        createdById,
        items: { create: lines },
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateBillDto) {
    const existing = await this.prisma.bill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Bill not found.");

    const updates: any = {
      vendorId: dto.vendorId,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      notes: dto.notes,
      terms: dto.terms,
    };
    if (dto.projectId !== undefined) updates.projectId = dto.projectId || null;

    if (dto.items) {
      const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
      // discountAmount may come in this update payload; if not, preserve the existing one
      const discountAmount = dto.discountAmount !== undefined
        ? Math.max(0, Number(dto.discountAmount))
        : Number(existing.discountAmount ?? 0);
      updates.subtotal = subtotal;
      updates.taxAmount = taxAmount;
      updates.discountAmount = discountAmount;
      updates.total = Math.max(0, subtotal + taxAmount - discountAmount);
      updates.items = { create: lines };
      // deleteMany + update must be atomic — a failed update otherwise leaves
      // the bill with zero items but the old totals.
      return this.prisma.$transaction(async (tx) => {
        await tx.billItem.deleteMany({ where: { billId: id } });
        return tx.bill.update({
          where: { id },
          data: updates,
          include: this.baseInclude,
        });
      });
    } else if (dto.discountAmount !== undefined) {
      // Discount-only update: recalculate total against existing subtotal/tax
      const discountAmount = Math.max(0, Number(dto.discountAmount));
      updates.discountAmount = discountAmount;
      updates.total = Math.max(0, Number(existing.subtotal) + Number(existing.taxAmount) - discountAmount);
    }

    return this.prisma.bill.update({
      where: { id },
      data: updates,
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    await this.prisma.billItem.deleteMany({ where: { billId: id } });
    await this.prisma.bill.delete({ where: { id } });
    return { success: true };
  }

  markOpen(id: string) {
    return this.prisma.bill.update({ where: { id }, data: { status: BillStatus.OPEN } });
  }
  voidBill(id: string) {
    return this.prisma.bill.update({ where: { id }, data: { status: BillStatus.VOID } });
  }

  async refreshStatuses() {
    const today = new Date();
    const bills = await this.prisma.bill.findMany({
      where: {
        status: { in: [BillStatus.OPEN, BillStatus.PARTIALLY_PAID] },
        dueDate: { lt: today },
      },
    });
    for (const b of bills) {
      if (Number(b.amountPaid) < Number(b.total)) {
        await this.prisma.bill.update({
          where: { id: b.id },
          data: { status: BillStatus.OVERDUE },
        });
      }
    }
    return { updated: bills.length };
  }
}
