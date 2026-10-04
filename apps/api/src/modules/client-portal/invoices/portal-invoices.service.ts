import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeInvoice } from "../serializers";

/**
 * Portal-facing invoice endpoints. Detail payload is shaped so the
 * front-end can hand it directly to <NuroInvoicePrint /> — same
 * component the staff dashboard uses to render and PDF-export. Keeps
 * the visual identity consistent between the portal and the printed
 * invoice.
 */
@Injectable()
export class PortalInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { clientId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeInvoice);
  }

  async detail(clientId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, clientId, status: { not: "DRAFT" } },
      include: {
        items: { include: { taxRate: true }, orderBy: { sortOrder: "asc" } },
        project: { select: { name: true } },
        client: { select: { companyName: true, contactPerson: true, address: true, email: true, phone: true } },
        allocations: { select: { amount: true } },
      },
    });
    if (!inv) throw new NotFoundException();
    const paidAmount = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const total = Number(inv.total);
    return {
      ...serializeInvoice(inv),
      amount: inv.amount,
      subtotal: inv.amount,
      tax: inv.tax,
      discount: inv.discountAmount ?? 0,
      total: inv.total,
      paidAmount,
      balanceTotal: Math.max(0, total - paidAmount),
      advance: inv.advanceAmount ?? null,
      notes: inv.notes ?? null,
      leadNote: inv.leadNote ?? null,
      referenceNumber: inv.referenceNumber ?? null,
      project: inv.project ? { name: inv.project.name } : null,
      client: inv.client,
      items: inv.items.map((it) => ({
        id: it.id,
        description: it.description,
        duration: it.duration ?? null,
        quantity: it.quantity,
        unitPrice: it.price,
        price: it.price,
        taxAmount: it.taxAmount,
        total: it.total,
      })),
    };
  }

  async assertOwned(clientId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, clientId, status: { not: "DRAFT" } },
      select: { id: true },
    });
    if (!inv) throw new NotFoundException();
  }
}
