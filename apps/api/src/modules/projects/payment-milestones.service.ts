import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, PaymentMilestoneStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export const DEFAULT_MILESTONE_TEMPLATE: Array<{ label: string; percentage: number; sortOrder: number }> = [
  { label: "Advance", percentage: 50, sortOrder: 0 },
  { label: "Mid-project", percentage: 30, sortOrder: 1 },
  { label: "Final", percentage: 20, sortOrder: 2 },
];

/**
 * Map a milestone's position into a polished, position-based name —
 * Advance / Milestone / Final. Hides user-typed labels which are
 * often gibberish ("nnjn", "j"). Mirrors the 50/30/20 industry
 * standard most agencies operate on.
 *  - 1 milestone : Final
 *  - 2 milestones: Advance · Final
 *  - 3 milestones: Advance · Milestone · Final
 *  - 4+         : Advance · Milestone 1 · Milestone 2 · … · Final
 */
export function phaseLabel(count: number, idx: number): string {
  if (count <= 1) return "Final";
  if (idx === 0) return "Advance";
  if (idx === count - 1) return "Final";
  if (count === 3) return "Milestone";
  return `Milestone ${idx}`;
}

/**
 * Produce the standardised note block for a milestone-bound invoice.
 * Used by `generateInvoice` and exported so the manual invoice flow
 * (InvoicesService.create) can drop the same paragraph in when the
 * caller doesn't supply their own notes.
 */
export function buildMilestoneNotes(args: {
  thisPhase: string;
  pct: number;
  budget: number;
  amount: number;
  schedule: string;
}): string[] {
  const { thisPhase, pct, budget, amount, schedule } = args;
  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return [
    `This invoice covers the ${thisPhase} payment — ${pct}% of the agreed project value of ${fmt(budget)} (${fmt(amount)}).`,
    `Payment Schedule: ${schedule}.`,
  ];
}

interface CreateMilestoneDto {
  label: string;
  percentage: number;
  sortOrder?: number;
  dueDate?: string;
  notes?: string;
  // When set, this milestone is a change-order / extra: it carries a
  // direct rupee `amount` instead of a percentage of the project budget,
  // and is excluded from the 100% schedule cap.
  isExtra?: boolean;
  amount?: number;
}

interface UpdateMilestoneDto {
  label?: string;
  percentage?: number;
  sortOrder?: number;
  dueDate?: string | null;
  notes?: string | null;
  status?: PaymentMilestoneStatus;
  amount?: number | null;
}

@Injectable()
export class PaymentMilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create the default 50/30/20 schedule for a brand-new project. */
  async seedDefaultsForProject(projectId: string) {
    return this.prisma.projectPaymentMilestone.createMany({
      data: DEFAULT_MILESTONE_TEMPLATE.map((m) => ({
        projectId,
        label: m.label,
        percentage: new Prisma.Decimal(m.percentage),
        sortOrder: m.sortOrder,
        status: PaymentMilestoneStatus.PENDING,
      })),
    });
  }

  list(projectId: string) {
    return this.prisma.projectPaymentMilestone.findMany({
      where: { projectId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            paidAt: true,
            dueDate: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(projectId: string, dto: CreateMilestoneDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found.");

    // Extras / change orders take a direct rupee amount and don't count
    // toward the 100% cap. Validate them separately.
    if (dto.isExtra) {
      const amount = Number(dto.amount ?? 0);
      if (!amount || amount <= 0) {
        throw new BadRequestException("Extra charges must have an amount greater than zero.");
      }
      if (!dto.label?.trim()) {
        throw new BadRequestException("Extras need a label so the client knows what they're being billed for.");
      }
      return this.prisma.projectPaymentMilestone.create({
        data: {
          projectId,
          label: dto.label.trim(),
          percentage: new Prisma.Decimal(0),
          isExtra: true,
          amount: new Prisma.Decimal(amount),
          sortOrder: dto.sortOrder ?? 9999, // extras drift to the bottom by default
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes,
        },
      });
    }

    if (dto.percentage <= 0 || dto.percentage > 100) {
      throw new BadRequestException("Percentage must be between 0 and 100.");
    }
    // Enforce: sum of regular (non-extra) milestone percentages cannot
    // exceed 100%. Extras are billed separately and not part of the cap.
    const existing = await this.prisma.projectPaymentMilestone.aggregate({
      where: { projectId, isExtra: false },
      _sum: { percentage: true },
    });
    const currentTotal = Number(existing._sum.percentage ?? 0);
    const projected = +(currentTotal + dto.percentage).toFixed(2);
    if (projected > 100.01) {
      const remaining = Math.max(0, +(100 - currentTotal).toFixed(2));
      throw new BadRequestException(
        `Adding this milestone would push the schedule to ${projected}%. Only ${remaining}% is available — adjust existing milestones first.`,
      );
    }
    return this.prisma.projectPaymentMilestone.create({
      data: {
        projectId,
        label: dto.label,
        percentage: new Prisma.Decimal(dto.percentage),
        sortOrder: dto.sortOrder ?? 0,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
      },
    });
  }

  async update(projectId: string, id: string, dto: UpdateMilestoneDto) {
    const existing = await this.prisma.projectPaymentMilestone.findUnique({ where: { id } });
    if (!existing || existing.projectId !== projectId) throw new NotFoundException("Milestone not found.");

    // Extras: validate amount, skip the percentage cap entirely.
    if (existing.isExtra) {
      if (dto.amount != null && dto.amount !== null && Number(dto.amount) <= 0) {
        throw new BadRequestException("Extra amount must be greater than zero.");
      }
      // For an extra that's already invoiced, also lock the amount so a
      // change can't drift the issued invoice out of sync.
      if (dto.amount != null && existing.invoiceId &&
          (existing.status === PaymentMilestoneStatus.INVOICED || existing.status === PaymentMilestoneStatus.PAID)) {
        throw new BadRequestException("This extra has already been invoiced. Void the invoice before changing the amount.");
      }
    } else {
      if (dto.percentage != null && (dto.percentage <= 0 || dto.percentage > 100)) {
        throw new BadRequestException("Percentage must be between 0 and 100.");
      }
      // Lock the percentage once an invoice has been issued, otherwise
      // the historical invoice amount stops matching the recomputed
      // "expected" (budget × pct) and clients see the "Issued amount
      // differs" warning on every refresh.
      if (
        dto.percentage != null &&
        Number(existing.percentage) !== dto.percentage &&
        existing.invoiceId &&
        (existing.status === PaymentMilestoneStatus.INVOICED || existing.status === PaymentMilestoneStatus.PAID)
      ) {
        throw new BadRequestException(
          "This milestone has already been invoiced. Void the existing invoice (or use Reissue) before changing the percentage.",
        );
      }
      // Same 100%-cap check as create, but exclude this milestone and any
      // extras (extras don't count toward the cap).
      if (dto.percentage != null) {
        const others = await this.prisma.projectPaymentMilestone.aggregate({
          where: { projectId, isExtra: false, NOT: { id } },
          _sum: { percentage: true },
        });
        const othersTotal = Number(others._sum.percentage ?? 0);
        const projected = +(othersTotal + dto.percentage).toFixed(2);
        if (projected > 100.01) {
          const remaining = Math.max(0, +(100 - othersTotal).toFixed(2));
          throw new BadRequestException(
            `This change would push the schedule to ${projected}%. Only ${remaining}% is available for this milestone.`,
          );
        }
      }
    }
    return this.prisma.projectPaymentMilestone.update({
      where: { id },
      data: {
        label: dto.label,
        percentage: dto.percentage != null ? new Prisma.Decimal(dto.percentage) : undefined,
        amount: dto.amount === null ? null : dto.amount != null ? new Prisma.Decimal(dto.amount) : undefined,
        sortOrder: dto.sortOrder,
        status: dto.status,
        dueDate: dto.dueDate === null ? null : dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes === null ? null : dto.notes,
      },
    });
  }

  async remove(projectId: string, id: string) {
    const existing = await this.prisma.projectPaymentMilestone.findUnique({ where: { id } });
    if (!existing || existing.projectId !== projectId) throw new NotFoundException("Milestone not found.");
    if (existing.status === PaymentMilestoneStatus.INVOICED || existing.status === PaymentMilestoneStatus.PAID) {
      throw new BadRequestException("Cannot delete a milestone that already has an invoice. Mark it SKIPPED or void the invoice first.");
    }
    await this.prisma.projectPaymentMilestone.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Generate an invoice for the given milestone.
   * Amount = project.budget × (milestone.percentage / 100).
   * Creates one invoice line item with description "Project: <name> — <label> (<percent>%)".
   */
  async generateInvoice(
    projectId: string,
    milestoneId: string,
    actorId: string,
    options: { dueDate?: string } = {},
  ) {
    const milestone = await this.prisma.projectPaymentMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: {
          include: { client: { select: { id: true, companyName: true } } },
        },
      },
    });
    if (!milestone || milestone.projectId !== projectId) {
      throw new NotFoundException("Milestone not found.");
    }
    if (milestone.status !== PaymentMilestoneStatus.PENDING) {
      throw new BadRequestException(`Milestone is already ${milestone.status}. Each milestone can only be invoiced once.`);
    }
    const project = milestone.project;
    const budget = Number(project.budget);

    // Extras carry a direct amount and don't depend on the project
    // budget — they're scope additions agreed mid-project. Regular
    // milestones still need a budget to compute their amount.
    let amount: number;
    let description: string;
    let noteLines: string[];

    if (milestone.isExtra) {
      const extraAmount = Number(milestone.amount ?? 0);
      if (!extraAmount || extraAmount <= 0) {
        throw new BadRequestException("This extra has no amount set. Edit it and add an amount before generating the invoice.");
      }
      amount = +extraAmount.toFixed(2);
      description = `${project.name} — ${milestone.label} (additional charge)`;
      const fmt = (n: number) =>
        `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
      const notesLines: string[] = [
        `This invoice covers an additional charge agreed during the ${project.name} project — ${milestone.label}: ${fmt(amount)}.`,
        `This is a scope addition and is billed separately from the original project schedule${budget > 0 ? ` (project base value ${fmt(budget)})` : ""}.`,
      ];
      noteLines = notesLines;
    } else {
      if (!budget || budget <= 0) {
        throw new BadRequestException("Project has no budget set. Set a budget on the project before generating milestone invoices.");
      }
      const pct = Number(milestone.percentage);
      amount = +(budget * (pct / 100)).toFixed(2);
      // Pull the full *regular* schedule for the "Payment Schedule"
      // line in the notes — extras shouldn't appear in that line since
      // they aren't part of the 50/30/20-style allocation.
      const regularMilestones = await this.prisma.projectPaymentMilestone.findMany({
        where: { projectId, isExtra: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      const thisIndex = regularMilestones.findIndex((m) => m.id === milestoneId);
      const thisPhase = phaseLabel(regularMilestones.length, thisIndex);
      const schedule = regularMilestones
        .map((m, i) => `${Number(m.percentage)}% ${phaseLabel(regularMilestones.length, i)}`)
        .join(" · ");
      description = `${project.name} — ${thisPhase} payment (${pct.toFixed(pct % 1 === 0 ? 0 : 2)}%)`;
      noteLines = buildMilestoneNotes({
        thisPhase,
        pct,
        budget,
        amount,
        schedule,
      });
    }

    // Match the invoice numbering used by InvoicesService.create (year + sequence).
    const settings = await this.prisma.organizationSettings.findFirst();
    const prefix = (settings?.invoicePrefix ?? "INV-").replace(/-?$/, "-");
    const count = await this.prisma.invoice.count();
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    // Default due date = today + paymentTerms days (org default), or whatever the caller passed.
    const dueDate = options.dueDate
      ? new Date(options.dueDate)
      : (() => {
          const days = settings?.paymentTerms ?? 30;
          const d = new Date();
          d.setDate(d.getDate() + days);
          return d;
        })();

    // Atomic flow: invoice create + milestone status flip + invoiceId
    // stitch all happen in ONE transaction. The previous "stitch the FK
    // after commit" version was a partial-failure trap — a crash between
    // commit and the follow-up update left the milestone in INVOICED
    // state with `invoiceId = null`, permanently stuck (the PENDING-only
    // re-invoice guard refuses it). Done as an interactive transaction so
    // we can use the created invoice's id inside the same tx.
    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId: project.clientId,
          projectId: project.id,
          amount: amount,
          tax: 0,
          total: amount,
          status: InvoiceStatus.DRAFT,
          dueDate,
          notes: noteLines.join("\n"),
          createdById: actorId,
          items: {
            create: [
              {
                description,
                quantity: 1,
                price: amount,
                taxAmount: 0,
                total: amount,
                sortOrder: 0,
              },
            ],
          },
        },
        include: { client: true, project: true, items: true },
      });
      await tx.projectPaymentMilestone.update({
        where: { id: milestoneId },
        data: { status: PaymentMilestoneStatus.INVOICED, invoiceId: inv.id },
      });
      return inv;
    });

    return { invoice, milestoneId };
  }

  /**
   * Void the milestone's existing invoice and generate a fresh one at
   * the current expected amount. Use when the milestone percentage or
   * project budget changed AFTER the original invoice was issued and
   * the issued amount no longer matches the recomputed expected.
   *
   * Refuses on a PAID milestone — voiding a paid invoice would leave
   * the payment unallocated. Staff must reconcile that manually.
   */
  async reissue(projectId: string, milestoneId: string, actorId: string) {
    const ms = await this.prisma.projectPaymentMilestone.findUnique({
      where: { id: milestoneId },
      include: { invoice: { select: { id: true, status: true, invoiceNumber: true } } },
    });
    if (!ms || ms.projectId !== projectId) throw new NotFoundException("Milestone not found.");
    if (ms.status === PaymentMilestoneStatus.PAID) {
      throw new BadRequestException("This milestone has been paid. Reconcile the payment manually before reissuing.");
    }
    if (!ms.invoice) {
      throw new BadRequestException("This milestone has no invoice attached. Use Generate Invoice instead.");
    }

    // Void the stale invoice and detach it from the milestone so
    // generateInvoice can run cleanly (it bails on non-PENDING).
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: ms.invoice.id },
        data: { status: InvoiceStatus.VOID },
      }),
      this.prisma.projectPaymentMilestone.update({
        where: { id: milestoneId },
        data: { status: PaymentMilestoneStatus.PENDING, invoiceId: null },
      }),
    ]);

    return this.generateInvoice(projectId, milestoneId, actorId);
  }

  /**
   * Recompute the milestone's percentage so it matches the issued
   * invoice amount. Use this on PAID milestones where the percentage
   * (or budget) was edited after invoicing and the row now shows a
   * permanent "issued amount differs" warning — there's no way to
   * void a paid invoice safely, so the only clean fix is to make the
   * milestone reflect the actual money received.
   *
   * Bypasses the normal 100%-cap check because we're snapping to a
   * historical truth, not introducing new schedule rows. The cap will
   * naturally re-balance once the user fixes the other milestones.
   */
  async snapToInvoice(projectId: string, milestoneId: string) {
    const ms = await this.prisma.projectPaymentMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: { select: { budget: true } }, invoice: { select: { total: true } } },
    });
    if (!ms || ms.projectId !== projectId) throw new NotFoundException("Milestone not found.");
    if (!ms.invoice) throw new BadRequestException("This milestone has no invoice — nothing to snap to.");

    const issued = Number(ms.invoice.total);
    if (ms.isExtra) {
      // For extras the milestone stores a direct amount, not a pct.
      return this.prisma.projectPaymentMilestone.update({
        where: { id: milestoneId },
        data: { amount: new Prisma.Decimal(issued) },
      });
    }
    const budget = Number(ms.project.budget);
    if (!budget || budget <= 0) {
      throw new BadRequestException("Project has no budget — cannot recompute percentage.");
    }
    const pct = +(((issued / budget) * 100)).toFixed(2);
    return this.prisma.projectPaymentMilestone.update({
      where: { id: milestoneId },
      data: { percentage: new Prisma.Decimal(pct) },
    });
  }

  /** Snap a milestone's status to PAID once its invoice is paid. */
  async syncStatusFromInvoice(invoiceId: string) {
    const ms = await this.prisma.projectPaymentMilestone.findUnique({
      where: { invoiceId },
    });
    if (!ms) return;
    await this.prisma.projectPaymentMilestone.update({
      where: { id: ms.id },
      data: { status: PaymentMilestoneStatus.PAID },
    });
  }
}
