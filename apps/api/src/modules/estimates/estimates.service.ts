import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EstimateStatus, InvoiceStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { nextNumber } from "../_shared/auto-number.util";
import { CreateEstimateDto, EstimateLineDto, UpdateEstimateDto } from "./dto/estimate.dto";

@Injectable()
export class EstimatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async computeLines(items: EstimateLineDto[]) {
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

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.estimate.findMany({
        include: {
          client: true,
          project: true,
          createdBy: true,
          items: { include: { item: true, taxRate: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.estimate.count(),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        createdBy: true,
        items: { include: { item: true, taxRate: true } },
      },
    });
    if (!estimate) throw new NotFoundException("Estimate not found.");
    return estimate;
  }

  async create(createdById: string, dto: CreateEstimateDto) {
    const settings = await this.prisma.organizationSettings.findFirst();
    const prefix = settings?.estimatePrefix ?? "EST-";
    const estimateNumber = await nextNumber(this.prisma, "estimate", prefix);
    const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
    const discountAmount = dto.discountAmount ?? 0;
    const total = subtotal - discountAmount + taxAmount;

    return this.prisma.estimate.create({
      data: {
        estimateNumber,
        clientId: dto.clientId,
        projectId: dto.projectId,
        issueDate: new Date(dto.issueDate),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        notes: dto.notes,
        terms: dto.terms,
        discountAmount,
        subtotal,
        taxAmount,
        total,
        createdById,
        items: { create: lines },
      },
      include: {
        client: true,
        project: true,
        createdBy: true,
        items: { include: { item: true, taxRate: true } },
      },
    });
  }

  async update(id: string, dto: UpdateEstimateDto) {
    const existing = await this.prisma.estimate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Estimate not found.");

    const updates: any = {
      clientId: dto.clientId,
      projectId: dto.projectId,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      notes: dto.notes,
      terms: dto.terms,
    };
    if (dto.discountAmount !== undefined) updates.discountAmount = dto.discountAmount;

    if (dto.items) {
      const { lines, subtotal, taxAmount } = await this.computeLines(dto.items);
      const discountAmount = dto.discountAmount ?? Number(existing.discountAmount);
      updates.subtotal = subtotal;
      updates.taxAmount = taxAmount;
      updates.total = subtotal - discountAmount + taxAmount;
      updates.items = { create: lines };
      // deleteMany + update must be atomic — if the update throws partway
      // we'd otherwise leave the estimate with zero items.
      return this.prisma.$transaction(async (tx) => {
        await tx.estimateItem.deleteMany({ where: { estimateId: id } });
        return tx.estimate.update({
          where: { id },
          data: updates,
          include: {
            client: true,
            project: true,
            createdBy: true,
            items: { include: { item: true, taxRate: true } },
          },
        });
      });
    }

    return this.prisma.estimate.update({
      where: { id },
      data: updates,
      include: {
        client: true,
        project: true,
        createdBy: true,
        items: { include: { item: true, taxRate: true } },
      },
    });
  }

  async remove(id: string) {
    await this.prisma.estimateItem.deleteMany({ where: { estimateId: id } });
    await this.prisma.estimate.delete({ where: { id } });
    return { success: true };
  }

  send(id: string) {
    return this.prisma.estimate.update({ where: { id }, data: { status: EstimateStatus.SENT } });
  }
  accept(id: string) {
    return this.prisma.estimate.update({ where: { id }, data: { status: EstimateStatus.ACCEPTED } });
  }
  decline(id: string) {
    return this.prisma.estimate.update({ where: { id }, data: { status: EstimateStatus.DECLINED } });
  }

  /**
   * Convert an accepted estimate into THREE staged DRAFT invoices matching the
   * standard 50/30/20 payment schedule shown on the printed estimate:
   *   1. Advance   — 50%, due immediately (today + paymentTerms)
   *   2. Milestone — 30%, due +30 days from the advance
   *   3. Final     — 20%, due +60 days from the advance
   *
   * Each invoice is a single-line ask for that stage's amount, with a leadNote
   * that gives the client context ("50% Advance · Project value ₹X"). The
   * estimate's `convertedInvoiceId` is pointed at the advance invoice for
   * back-compat with existing code paths.
   */
  async convertToInvoice(id: string, createdById: string) {
    const estimate = await this.findOne(id);
    if (estimate.convertedInvoiceId) {
      throw new BadRequestException("Estimate already converted.");
    }

    const settings = await this.prisma.organizationSettings.findFirst();
    const prefix = settings?.invoicePrefix ?? "INV-";
    const paymentTermsDays = settings?.paymentTerms ?? 30;
    const baseInvoiceCount = await this.prisma.invoice.count();

    const contractTotal = Number(estimate.subtotal);
    const projectName = estimate.project?.name ?? "project";
    const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

    const STAGES = [
      { label: "Advance", percent: 50, dueOffsetDays: 0 },
      { label: "Milestone", percent: 30, dueOffsetDays: 30 },
      { label: "Final", percent: 20, dueOffsetDays: 60 },
    ];

    // All three invoices + the estimate flip must commit together. Without a
    // transaction, a failure mid-way would leave orphan invoices with no
    // pointer back, and the estimate stuck in ACCEPTED so the user could
    // re-trigger conversion and double-bill.
    const invoices = await this.prisma.$transaction(async (tx) => {
      const created: { id: string }[] = [];
      for (let i = 0; i < STAGES.length; i++) {
        const stage = STAGES[i];
        const amount = Math.round((contractTotal * stage.percent) / 100);
        const dueDate = new Date(
          Date.now() + (paymentTermsDays + stage.dueOffsetDays) * 86400000,
        );
        const invoiceNumber = `${prefix}${String(baseInvoiceCount + i + 1).padStart(4, "0")}`;
        const description = `${stage.percent}% ${stage.label} Payment — ${projectName}`;
        const leadNote = `${stage.percent}% ${stage.label} · Project value ${formatINR(contractTotal)}`;

        const inv = await tx.invoice.create({
          data: {
            invoiceNumber,
            clientId: estimate.clientId,
            projectId: estimate.projectId ?? undefined,
            amount,
            tax: 0,
            total: amount,
            status: InvoiceStatus.DRAFT,
            dueDate,
            notes: estimate.notes ?? undefined,
            leadNote,
            createdById,
            items: {
              create: [
                {
                  description,
                  quantity: 1,
                  price: amount,
                  taxAmount: 0,
                  total: amount,
                },
              ],
            },
          },
        });
        created.push({ id: inv.id });
      }

      await tx.estimate.update({
        where: { id },
        data: {
          convertedInvoiceId: created[0].id,
          status: EstimateStatus.INVOICED,
        },
      });
      return created;
    });

    return { invoices, primaryInvoiceId: invoices[0].id };
  }
}
