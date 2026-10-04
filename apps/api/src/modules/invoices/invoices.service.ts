import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, NotificationType, PaymentMethod, PaymentMilestoneStatus, PaymentType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PdfService } from "../../common/pdf/pdf.service";
import { MailService } from "../../common/mail/mail.service";
import { env } from "../../config/env";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { AutoPostService } from "../finance/auto-post.service";
import { NotificationsService } from "../notifications/notifications.service";
import { nextNumber } from "../_shared/auto-number.util";
import { buildMilestoneNotes, phaseLabel } from "../projects/payment-milestones.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly autoPost: AutoPostService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        include: {
          client: true,
          project: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.invoice.count(),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(createdById: string, dto: CreateInvoiceDto) {
    const count = await this.prisma.invoice.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    // Pre-fetch referenced tax rates to compute line-level tax
    const taxIds = Array.from(new Set(dto.items.map((i) => i.taxRateId).filter(Boolean))) as string[];
    const taxRates = taxIds.length
      ? await this.prisma.taxRate.findMany({ where: { id: { in: taxIds } } })
      : [];
    const taxRateMap = new Map(taxRates.map((r) => [r.id, Number(r.rate)]));

    // Compute line totals and taxes on the server (authoritative)
    const lines = dto.items.map((item, idx) => {
      const lineBase = Number(item.quantity) * Number(item.price);
      const rate = item.taxRateId ? taxRateMap.get(item.taxRateId) ?? 0 : 0;
      const taxAmount = +(lineBase * (rate / 100)).toFixed(2);
      const total = +(lineBase + taxAmount).toFixed(2);
      return {
        itemId: item.itemId,
        description: item.description,
        duration: item.duration?.trim() ? item.duration.trim() : null,
        quantity: item.quantity,
        price: item.price,
        taxRateId: item.taxRateId,
        taxAmount,
        total,
        sortOrder: item.sortOrder ?? idx,
      };
    });

    const subtotal = +lines.reduce((s, l) => s + Number(l.quantity) * Number(l.price), 0).toFixed(2);
    const taxTotal = +lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2);
    const discount = Number(dto.discountAmount ?? 0);
    const grandTotal = +(subtotal + taxTotal - discount).toFixed(2);

    // If the invoice is for a project with a payment schedule and the
    // user didn't type their own notes, auto-fill them with the same
    // standardised block the milestone-generated invoice uses so the
    // NOTES section reads the same regardless of which side issued
    // the invoice. We pick the closest payment milestone by amount —
    // if the invoice total matches a milestone within ±1%, it's
    // almost certainly that milestone. Otherwise we drop just the
    // schedule line without claiming this is any specific phase.
    let autoNotes: string | null = null;
    if (dto.projectId && !(dto.notes && dto.notes.trim())) {
      autoNotes = await this.buildProjectInvoiceNotes(dto.projectId, grandTotal);
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId: dto.clientId,
        projectId: dto.projectId,
        amount: subtotal,
        tax: taxTotal,
        total: grandTotal,
        discountAmount: discount,
        advanceAmount: dto.advanceAmount != null ? Number(dto.advanceAmount) : null,
        status: dto.status ?? InvoiceStatus.DRAFT,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes ?? autoNotes ?? null,
        leadNote: dto.leadNote?.trim() ? dto.leadNote.trim() : null,
        referenceNumber: dto.referenceNumber?.trim() ? dto.referenceNumber.trim() : null,
        createdById,
        items: { create: lines },
      },
      include: {
        client: true,
        project: true,
        items: { include: { taxRate: true } },
      },
    });

    // If this invoice is for a project with a payment schedule, try to
    // attach it to the matching milestone so the project's Payment
    // Schedule tab reflects the manual invoice too. We match by total
    // (within ±1%) to the closest PENDING, unlinked milestone — this
    // mirrors what `buildProjectInvoiceNotes` already does for notes
    // and keeps the two surfaces in sync. Failure to link is non-fatal:
    // the invoice itself was created successfully.
    if (dto.projectId) {
      try {
        await this.linkInvoiceToMilestone(invoice.id, dto.projectId, grandTotal);
      } catch (err) {
        console.warn("[invoices] milestone auto-link failed:", err);
      }
    }

    return invoice;
  }

  /**
   * Find the best-matching PENDING, unlinked milestone for this invoice
   * total (±1% tolerance) and link it: set `milestone.invoiceId` and
   * flip status to INVOICED. Idempotent — if no eligible milestone
   * exists, does nothing.
   */
  private async linkInvoiceToMilestone(invoiceId: string, projectId: string, invoiceTotal: number): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        budget: true,
        paymentMilestones: {
          where: { invoiceId: null, status: PaymentMilestoneStatus.PENDING },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!project) return;
    const budget = Number(project.budget ?? 0);
    if (project.paymentMilestones.length === 0) return;

    // Expected amount differs per milestone type: extras use their own
    // direct amount, regular ones use budget × percentage.
    const candidates = project.paymentMilestones
      .map((m) => {
        const expected = m.isExtra
          ? Number(m.amount ?? 0)
          : budget * (Number(m.percentage) / 100);
        return { m, expected, diff: Math.abs(expected - invoiceTotal) };
      })
      .filter((c) => c.expected > 0)
      .sort((a, b) => a.diff - b.diff);
    if (candidates.length === 0) return;
    const match = candidates[0];
    const closeEnough = match.diff / Math.max(invoiceTotal, match.expected) < 0.01;
    if (!closeEnough) return;

    await this.prisma.projectPaymentMilestone.update({
      where: { id: match.m.id },
      data: { invoiceId, status: PaymentMilestoneStatus.INVOICED },
    });
  }

  /**
   * Auto-generate the "Payment Schedule + this-phase" note block for
   * a project invoice. Matches the invoice total against the project's
   * payment milestones — if a match is found (within ±1%), the notes
   * call out that specific phase. Otherwise we still drop the schedule
   * line so the NOTES section reads consistently with the milestone-
   * generated path.
   *
   * Returns `null` if the project has no payment schedule or no budget.
   */
  private async buildProjectInvoiceNotes(projectId: string, invoiceTotal: number): Promise<string | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        budget: true,
        paymentMilestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!project) return null;
    const budget = Number(project.budget ?? 0);
    const milestones = project.paymentMilestones;
    if (milestones.length === 0) return null;

    const fmt = (n: number) =>
      `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

    // Build the regular schedule line from non-extra milestones only.
    const regulars = milestones.filter((m) => !m.isExtra);
    const schedule = regulars
      .map((m, i) => `${Number(m.percentage)}% ${phaseLabel(regulars.length, i)}`)
      .join(" · ");

    // Try to match this invoice's total to ANY milestone (regular or
    // extra) by amount. Extras compare against their own `amount`;
    // regular milestones against budget × percentage. ±1% tolerance.
    const candidates = milestones
      .map((m) => {
        const expected = m.isExtra
          ? Number(m.amount ?? 0)
          : budget * (Number(m.percentage) / 100);
        return { m, expected, diff: Math.abs(expected - invoiceTotal) };
      })
      .filter((c) => c.expected > 0)
      .sort((a, b) => a.diff - b.diff);
    const match = candidates[0];
    const closeEnough = match && match.diff / Math.max(invoiceTotal, match.expected) < 0.01;

    if (closeEnough && match.m.isExtra) {
      // Extras get a different note shape — they're a scope addition,
      // not a percentage of the original budget.
      return [
        `This invoice covers an additional charge agreed during the ${project.name} project — ${match.m.label}: ${fmt(invoiceTotal)}.`,
        `This is a scope addition and is billed separately from the original project schedule${budget > 0 ? ` (project base value ${fmt(budget)})` : ""}.`,
      ].join("\n");
    }

    if (closeEnough && !match.m.isExtra && budget > 0) {
      const idx = regulars.findIndex((r) => r.id === match.m.id);
      const phase = phaseLabel(regulars.length, idx);
      return buildMilestoneNotes({
        thisPhase: phase,
        pct: Number(match.m.percentage),
        budget,
        amount: invoiceTotal,
        schedule,
      }).join("\n");
    }
    if (budget > 0 && schedule) {
      // No specific phase — just the schedule line for context.
      return `Payment Schedule: ${schedule}.`;
    }
    return null;
  }

  /**
   * Update an existing invoice. Only allowed while the invoice is still a DRAFT
   * — once it's been sent, paid, etc. the audit trail matters and we should not
   * silently mutate the document; the user can void it and create a new one.
   * If `items` is supplied, the line-item set is replaced wholesale and totals
   * are recomputed server-side.
   */
  async update(id: string, dto: import("./dto/create-invoice.dto").UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Invoice not found.");
    // PAID and VOID are completed states — editing them would break the audit
    // trail. DRAFT/SENT/OVERDUE/PARTIAL are still in flight and can be corrected.
    const lockedStatuses: InvoiceStatus[] = [InvoiceStatus.PAID, InvoiceStatus.VOID];
    if (lockedStatuses.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit a ${existing.status.toLowerCase()} invoice. Void and reissue instead.`,
      );
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.clientId !== undefined) data.client = { connect: { id: dto.clientId } };
    if (dto.projectId !== undefined) {
      data.project = dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true };
    }
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.leadNote !== undefined) data.leadNote = dto.leadNote?.trim() ? dto.leadNote.trim() : null;
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber?.trim() ? dto.referenceNumber.trim() : null;
    if (dto.advanceAmount !== undefined) data.advanceAmount = dto.advanceAmount;

    if (dto.items) {
      const taxIds = Array.from(new Set(dto.items.map((i) => i.taxRateId).filter(Boolean))) as string[];
      const taxRates = taxIds.length
        ? await this.prisma.taxRate.findMany({ where: { id: { in: taxIds } } })
        : [];
      const taxRateMap = new Map(taxRates.map((r) => [r.id, Number(r.rate)]));

      const lines = dto.items.map((item, idx) => {
        const lineBase = Number(item.quantity) * Number(item.price);
        const rate = item.taxRateId ? taxRateMap.get(item.taxRateId) ?? 0 : 0;
        const taxAmount = +(lineBase * (rate / 100)).toFixed(2);
        const total = +(lineBase + taxAmount).toFixed(2);
        return {
          itemId: item.itemId,
          description: item.description,
          duration: item.duration?.trim() ? item.duration.trim() : null,
          quantity: item.quantity,
          price: item.price,
          taxRateId: item.taxRateId,
          taxAmount,
          total,
          sortOrder: item.sortOrder ?? idx,
        };
      });

      const subtotal = +lines.reduce((s, l) => s + Number(l.quantity) * Number(l.price), 0).toFixed(2);
      const taxTotal = +lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2);
      // Prefer the payload's discount; fall back to whatever was previously stored.
      const discount = Number(dto.discountAmount ?? Number(existing.discountAmount ?? 0));
      const grandTotal = +(subtotal + taxTotal - discount).toFixed(2);

      data.amount = subtotal;
      data.tax = taxTotal;
      data.total = grandTotal;
      data.discountAmount = discount;

      // Replace line items in a transaction so we never end up with mixed state.
      return this.prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceItem.createMany({ data: lines.map((l) => ({ ...l, invoiceId: id })) });
        return tx.invoice.update({
          where: { id },
          data,
          include: { client: true, project: true, items: { include: { taxRate: true } } },
        });
      });
    }

    if (dto.discountAmount !== undefined) {
      // No item changes — only update the discount and recompute total accordingly.
      const subtotal = Number(existing.amount);
      const tax = Number(existing.tax);
      const discount = Number(dto.discountAmount);
      data.total = +(subtotal + tax - discount).toFixed(2);
      data.discountAmount = discount;
    }

    return this.prisma.invoice.update({
      where: { id },
      data,
      include: { client: true, project: true, items: { include: { taxRate: true } } },
    });
  }

  async send(id: string) {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.SENT,
      },
    });
    // Best-effort: email the client a branded invoice notification.
    // Failures here must not roll back the status — the staff intent
    // ("invoice is sent") is captured by the DB write above.
    await this.dispatchInvoiceEmail(id);
    return updated;
  }

  /**
   * Email the invoice summary to every active portal contact on the
   * client. Falls back to `client.email` when no portal contacts exist
   * yet. Best-effort; logs and swallows failures.
   */
  private async dispatchInvoiceEmail(invoiceId: string): Promise<void> {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          client: { include: { clientContacts: { where: { status: "ACTIVE" } } } },
          project: { select: { name: true } },
        },
      });
      if (!invoice) return;

      const recipients = new Set<string>();
      for (const c of invoice.client.clientContacts) {
        if (c.email) recipients.add(c.email);
      }
      if (recipients.size === 0 && invoice.client.email) {
        recipients.add(invoice.client.email);
      }
      if (recipients.size === 0) {
        this.logger.warn(`No email recipients for invoice ${invoiceId} — skipping send.`);
        return;
      }

      const fmtCurrency = (n: number) =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
      const fmtDate = (d: Date) =>
        d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

      const portalUrl = `${env.portalUrl.replace(/\/$/, "")}/portal/invoices/${invoice.id}`;
      const firstContact = invoice.client.clientContacts[0];

      await Promise.all(
        Array.from(recipients).map((to) =>
          this.mail.sendInvoiceEmail(to, {
            recipientName: firstContact?.name ?? null,
            clientName: invoice.client.companyName,
            invoiceNumber: invoice.invoiceNumber,
            amountFormatted: fmtCurrency(Number(invoice.total)),
            dueDate: fmtDate(new Date(invoice.dueDate)),
            issuedOn: fmtDate(new Date(invoice.createdAt)),
            projectName: invoice.project?.name ?? null,
            referenceNumber: invoice.referenceNumber,
            paymentInstructions: invoice.leadNote,
            portalUrl,
          }).catch((err) => this.logger.warn(`Invoice mail to ${to} failed: ${(err as Error).message}`)),
        ),
      );
    } catch (err) {
      this.logger.warn(`dispatchInvoiceEmail(${invoiceId}) failed: ${(err as Error).message}`);
    }
  }

  async markPaid(id: string, actorId?: string) {
    // Marking an invoice paid without a Payment record was leaving the
    // GL silent — the AR side flipped to PAID, but no journal entry
    // landed. Now we ensure a backing Payment exists; if not, we
    // synthesize one for the unpaid balance so the GL stays
    // consistent. Non-fatal if actorId is missing (legacy callers).
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { allocations: { include: { payment: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const alreadyPaid = invoice.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const outstanding = Math.max(0, Number(invoice.total) - alreadyPaid);

    // If there's any outstanding balance, synthesize a Payment +
    // allocation. We attach it to the primary bank so the bank txn +
    // currentBalance update happen too — otherwise the GL would credit
    // cash but bank.currentBalance wouldn't move, and the dashboard
    // reconciliation breaks. autoPost.postPayment then lands the JE.
    if (outstanding > 0 && actorId) {
      const paymentNumber = await nextNumber(this.prisma, "payment", "PAY-");
      const primaryBank = await this.autoPost.getPrimaryBank();
      const paymentDate = new Date();
      const payment = await this.prisma.payment.create({
        data: {
          paymentNumber,
          type: PaymentType.RECEIVED,
          amount: new Prisma.Decimal(outstanding),
          paymentDate,
          method: PaymentMethod.BANK_TRANSFER,
          notes: `Auto-recorded on Mark Paid for invoice ${invoice.invoiceNumber}`,
          clientId: invoice.clientId,
          bankAccountId: primaryBank?.id,
          createdById: actorId,
          allocations: {
            create: [{ invoiceId: id, amount: new Prisma.Decimal(outstanding) }],
          },
        },
      });
      // Mirror to the bank like PaymentsService.create does, so the
      // bank's running balance reflects the cash that just landed.
      if (primaryBank) {
        await this.prisma.bankTransaction.create({
          data: {
            bankAccountId: primaryBank.id,
            date: paymentDate,
            amount: new Prisma.Decimal(outstanding),
            type: "CREDIT",
            description: `Payment ${paymentNumber}`,
            paymentId: payment.id,
          },
        });
        await this.prisma.bankAccount.update({
          where: { id: primaryBank.id },
          data: { currentBalance: { increment: new Prisma.Decimal(outstanding) } },
        });
      }
      try {
        await this.autoPost.postPayment(payment.id, actorId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Invoice.markPaid] auto-post failed for payment", payment.id, err);
      }
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });
    // If this invoice is linked to a project payment milestone, auto-flip it to PAID.
    // Non-fatal — payment record is what matters; milestone sync is just for the schedule view.
    try {
      const milestone = await this.prisma.projectPaymentMilestone.findUnique({ where: { invoiceId: id } });
      if (milestone && milestone.status !== "PAID") {
        await this.prisma.projectPaymentMilestone.update({
          where: { id: milestone.id },
          data: { status: "PAID" },
        });
      }
    } catch {
      /* non-fatal */
    }

    // Notify finance + project manager that the invoice is paid. Real
    // collections-celebration / GL-confirmation moment; previously the
    // event was silent and finance had to actively check the AR aging
    // page to see it.
    try {
      const full = await this.prisma.invoice.findUnique({
        where: { id },
        include: {
          client: { select: { companyName: true } },
          project: { select: { id: true, name: true, managerId: true } },
        },
      });
      if (full) {
        const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
        const admins = await this.prisma.user.findMany({
          where: {
            status: "ACTIVE",
            roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"] } } } },
          },
          select: { id: true },
        });
        const recipients = new Set<string>(admins.map((u) => u.id));
        if (full.project?.managerId) recipients.add(full.project.managerId);
        if (actorId) recipients.delete(actorId);
        const body = full.project?.name
          ? `${full.client?.companyName ?? "Client"} paid ${fmtMoney(Number(full.total))} on ${full.project.name}.`
          : `${full.client?.companyName ?? "Client"} paid ${fmtMoney(Number(full.total))}.`;
        await Promise.all(
          Array.from(recipients).map((uid) =>
            this.notifications.create(uid, {
              type: NotificationType.GENERIC,
              title: `Invoice paid: ${full.invoiceNumber}`,
              body,
              link: `/invoices/${id}/print`,
              projectId: full.project?.id,
            }).catch(() => undefined),
          ),
        );
      }
    } catch {
      /* non-fatal */
    }

    return updated;
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        items: true,
        createdBy: true,
        allocations: { select: { id: true, amount: true, createdAt: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    return invoice;
  }

  async exportPdf(id: string) {
    const invoice = await this.findOne(id);
    const sections = [
      { label: "Invoice Number", value: invoice.invoiceNumber },
      { label: "Client", value: invoice.client.companyName },
      { label: "Project", value: invoice.project?.name ?? "General services" },
      {
        label: "Items",
        value: invoice.items.map((item) => `${item.description} | Qty ${item.quantity} | ${item.total}`).join("\n"),
      },
      { label: "Subtotal", value: String(invoice.amount) },
      { label: "Tax", value: String(invoice.tax) },
      { label: "Total", value: String(invoice.total) },
      { label: "Status", value: invoice.status },
    ];

    return this.pdfService.generateDocument(`Invoice ${invoice.invoiceNumber}`, sections);
  }
}
