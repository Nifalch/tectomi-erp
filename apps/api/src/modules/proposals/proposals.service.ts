import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DeliverableKind, ProposalStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PdfService } from "../../common/pdf/pdf.service";
import { MailService } from "../../common/mail/mail.service";
import { env } from "../../config/env";
import { CreateProposalDto, UpdateProposalDto } from "./dto/create-proposal.dto";

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly mail: MailService,
  ) {}

  /** State machine: DRAFT → SENT → (ACCEPTED | REJECTED). EXPIRED is a separate terminal state. */
  private static readonly TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
    DRAFT: [ProposalStatus.SENT],
    SENT: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED, ProposalStatus.EXPIRED],
    ACCEPTED: [],
    REJECTED: [],
    EXPIRED: [],
  };

  private async transitionStatus(id: string, next: ProposalStatus) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException("Proposal not found.");
    const allowed = ProposalsService.TRANSITIONS[proposal.status];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition proposal from ${proposal.status} to ${next}. Allowed: ${allowed.join(", ") || "(none — terminal state)"}.`,
      );
    }
    return this.prisma.proposal.update({
      where: { id },
      data: { status: next },
      include: { client: true, project: true, blocks: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async send(id: string) {
    const updated = await this.transitionStatus(id, ProposalStatus.SENT);
    // Email the proposal best-effort. We don't want a transient SMTP
    // failure to roll back the status change — the staff intent ("this
    // proposal is sent") is recorded as soon as the row updates.
    await this.dispatchProposalEmail(id, { kind: "sent" });
    return updated;
  }
  markAccepted(id: string) { return this.transitionStatus(id, ProposalStatus.ACCEPTED); }
  markRejected(id: string) { return this.transitionStatus(id, ProposalStatus.REJECTED); }
  markExpired(id: string) { return this.transitionStatus(id, ProposalStatus.EXPIRED); }

  /**
   * Resend a rejected proposal — clears the client's prior decision and
   * flips the status back to SENT so the portal can present it as
   * pending again. Used when the PM has tweaked the proposal in
   * response to a rejection and wants the client to reconsider.
   * Bypasses the SENT→REJECTED→SENT block in the state machine.
   */
  async resend(id: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException("Proposal not found.");
    if (proposal.status !== ProposalStatus.REJECTED) {
      throw new BadRequestException(`Can only resend a rejected proposal. Current status: ${proposal.status}.`);
    }
    // Drop the prior acceptance row AND flip the status in one transaction
    // so a mid-flight failure can't delete the audit row without actually
    // resending — leaving the proposal stuck REJECTED with no acceptance
    // history (un-recoverable from the UI).
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.proposalAcceptance.deleteMany({ where: { proposalId: id } });
      return tx.proposal.update({
        where: { id },
        data: { status: ProposalStatus.SENT },
        include: { client: true, project: true, blocks: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await this.dispatchProposalEmail(id, { kind: "resent" });
    return updated;
  }

  /**
   * Admin override — force a proposal into ACCEPTED status regardless
   * of current state. Used when a client gives verbal/email approval
   * after a rejection and we want the GL/project flow to proceed
   * without making the client click "Accept" again in the portal.
   * Preserves any prior acceptance row so the audit history is intact.
   */
  async forceAccept(id: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException("Proposal not found.");
    if (proposal.status === ProposalStatus.ACCEPTED) {
      return proposal;
    }
    return this.prisma.proposal.update({
      where: { id },
      data: { status: ProposalStatus.ACCEPTED },
      include: { client: true, project: true, blocks: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.proposal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Proposal not found.");
    // ProposalBlock + ProposalDeliverable both cascade on delete (FK definition),
    // so a single proposal.delete() removes the whole document tree.
    await this.prisma.proposal.delete({ where: { id } });
    return { success: true };
  }

  async findAll(filters: { projectId?: string; clientId?: string; status?: string } = {}) {
    return this.prisma.proposal.findMany({
      where: {
        projectId: filters.projectId,
        clientId: filters.clientId,
        status: filters.status as any,
      },
      include: {
        client: true,
        project: true,
        blocks: { orderBy: { sortOrder: "asc" } },
        deliverables: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(createdById: string, dto: CreateProposalDto) {
    return this.prisma.proposal.create({
      data: {
        clientId: dto.clientId,
        projectId: dto.projectId,
        projectName: dto.projectName,
        description: dto.description,
        projectUnderstanding: dto.projectUnderstanding,
        timeline: dto.timeline,
        pricing: dto.pricing,
        paymentTermsText: dto.paymentTermsText,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        createdById,
        blocks: {
          create: dto.blocks.map((block, index) => ({
            heading: block.heading,
            content: block.content,
            durationWeeks: block.durationWeeks ?? null,
            sortOrder: index + 1,
          })),
        },
        deliverables: dto.deliverables?.length
          ? {
              create: dto.deliverables.map((d, index) => ({
                kind: d.kind as DeliverableKind,
                title: d.title,
                description: d.description,
                amount: d.amount ?? null,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        client: true,
        project: true,
        blocks: { orderBy: { sortOrder: "asc" } },
        deliverables: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      },
    });
  }

  async update(id: string, dto: UpdateProposalDto) {
    const existing = await this.prisma.proposal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Proposal not found.");

    const data: Record<string, unknown> = {};
    // Client + project reassignment. Use Prisma's relation connect/disconnect
    // form so we don't write a stray scalar FK that bypasses validation.
    if (dto.clientId !== undefined && dto.clientId !== "") {
      data.client = { connect: { id: dto.clientId } };
    }
    if (dto.projectId !== undefined) {
      data.project = dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true };
    }
    if (dto.projectName !== undefined) data.projectName = dto.projectName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.projectUnderstanding !== undefined) data.projectUnderstanding = dto.projectUnderstanding;
    if (dto.timeline !== undefined) data.timeline = dto.timeline;
    if (dto.pricing !== undefined) data.pricing = dto.pricing;
    if (dto.paymentTermsText !== undefined) data.paymentTermsText = dto.paymentTermsText;
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    // Replace blocks + deliverables atomically with the scalar update.
    // Before this guard, a DB error during `proposal.update()` after the
    // `deleteMany` would commit the deletes and leave the proposal empty —
    // the user would re-open it next time and see all blocks/deliverables
    // gone. Wrapping in $transaction guarantees both succeed or both roll
    // back together.
    return this.prisma.$transaction(async (tx) => {
      if (dto.blocks) {
        await tx.proposalBlock.deleteMany({ where: { proposalId: id } });
        data.blocks = {
          create: dto.blocks.map((b, index) => ({
            heading: b.heading,
            content: b.content,
            durationWeeks: b.durationWeeks ?? null,
            sortOrder: index + 1,
          })),
        };
      }
      if (dto.deliverables) {
        await tx.proposalDeliverable.deleteMany({ where: { proposalId: id } });
        data.deliverables = {
          create: dto.deliverables.map((d, index) => ({
            kind: d.kind as DeliverableKind,
            title: d.title,
            description: d.description,
            amount: d.amount ?? null,
            sortOrder: index,
          })),
        };
      }
      return tx.proposal.update({
        where: { id },
        data,
        include: {
          client: true,
          project: true,
          blocks: { orderBy: { sortOrder: "asc" } },
          deliverables: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        },
      });
    });
  }

  async findOne(id: string) {
    return this.prisma.proposal.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        createdBy: true,
        blocks: { orderBy: { sortOrder: "asc" } },
        deliverables: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        acceptance: { include: { contact: { select: { name: true, email: true } } } },
      },
    });
  }

  async exportPdf(id: string) {
    const proposal = await this.findOne(id);

    if (!proposal) {
      throw new Error("Proposal not found.");
    }

    return this.pdfService.generateDocument(`Proposal ${proposal.projectName}`, [
      { label: "Client", value: proposal.client.companyName },
      { label: "Project", value: proposal.projectName },
      { label: "Description", value: proposal.description },
      { label: "Timeline", value: proposal.timeline },
      { label: "Pricing", value: proposal.pricing },
      {
        label: "Sections",
        value: proposal.blocks.map((block) => `${block.heading}: ${block.content}`).join("\n"),
      },
    ]);
  }

  /**
   * Email the proposal to every active portal contact on the client
   * record. Falls back to `client.email` if no portal contacts exist
   * so a recently-onboarded client without portal access still gets
   * notified. Best-effort — failures are logged, not thrown, so a
   * mis-typed contact email doesn't block the state transition.
   */
  private async dispatchProposalEmail(
    proposalId: string,
    { kind }: { kind: "sent" | "resent" },
  ): Promise<void> {
    try {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: proposalId },
        include: {
          client: { include: { clientContacts: { where: { status: "ACTIVE" } } } },
          deliverables: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
      });
      if (!proposal) return;

      const recipients = new Set<string>();
      for (const c of proposal.client.clientContacts) {
        if (c.email) recipients.add(c.email);
      }
      if (recipients.size === 0 && proposal.client.email) {
        recipients.add(proposal.client.email);
      }
      if (recipients.size === 0) {
        this.logger.warn(`No email recipients for proposal ${proposalId} — skipping send.`);
        return;
      }

      const portalUrl = `${env.portalUrl.replace(/\/$/, "")}/portal/proposals/${proposal.id}`;
      const included = proposal.deliverables.filter((d) => d.kind === "INCLUDED");
      const pricedItems = included.filter((d) => d.amount != null && Number(d.amount) > 0);
      const total = pricedItems.reduce((s, d) => s + Number(d.amount ?? 0), 0);
      const formatINR = (n: number) =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
      const validUntil = proposal.validUntil
        ? new Date(proposal.validUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
        : null;
      const preparedOn = proposal.createdAt
        ? new Date(proposal.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
        : null;

      // The PM/AE name on the cover letter — falls back to the org
      // brand name (filled in by the template) if no createdBy.
      const preparedBy = proposal.createdBy
        ? `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`.trim() || null
        : null;

      const firstContact = proposal.client.clientContacts[0];

      // Friendly proposal number: prefix + last 6 of the cuid.
      const proposalNumber = proposal.id ? proposal.id.slice(-6).toUpperCase() : null;

      await Promise.all(
        Array.from(recipients).map((to) =>
          this.mail.sendProposalEmail(to, {
            recipientName: firstContact?.name ?? null,
            clientName: proposal.client.companyName,
            projectName: proposal.projectName,
            proposalNumber,
            preparedOn,
            preparedBy: preparedBy ?? undefined,
            validUntil,
            investment: total > 0 ? formatINR(total) : null,
            timeline: proposal.timeline,
            summary: proposal.description,
            inclusions: included.slice(0, 6).map((d) => d.title),
            portalUrl,
            variant: kind,
          }).catch((err) => this.logger.warn(`Proposal mail to ${to} failed: ${(err as Error).message}`)),
        ),
      );
    } catch (err) {
      this.logger.warn(`dispatchProposalEmail(${proposalId}) failed: ${(err as Error).message}`);
    }
  }
}
