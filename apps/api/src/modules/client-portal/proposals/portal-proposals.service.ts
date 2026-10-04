import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { serializeProposal } from "../serializers";
import type { DecideDto } from "./dto";

@Injectable()
export class PortalProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(clientId: string) {
    const rows = await this.prisma.proposal.findMany({
      where: { clientId, status: { in: ["SENT", "ACCEPTED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeProposal);
  }

  async detail(clientId: string, id: string) {
    const p = await this.prisma.proposal.findFirst({
      where: { id, clientId, status: { in: ["SENT", "ACCEPTED", "REJECTED"] } },
      include: {
        // Explicit orderBy so insertion-order accidents don't scramble
        // phases / deliverables; staff edits use delete-and-recreate and
        // rely on sortOrder to preserve sequence.
        blocks: { orderBy: { sortOrder: "asc" } },
        deliverables: { orderBy: { sortOrder: "asc" } },
        acceptance: true,
      },
    });
    if (!p) throw new NotFoundException();
    return {
      ...serializeProposal(p),
      description: p.description,
      projectUnderstanding: p.projectUnderstanding,
      timeline: p.timeline,
      pricing: p.pricing,
      paymentTermsText: p.paymentTermsText,
      blocks: p.blocks,
      deliverables: p.deliverables,
      // Date fields used by <NuroProposalPrint /> for the cover page —
      // without these, the staff PDF and portal copy diverge.
      createdAt: p.createdAt,
      validUntil: p.validUntil,
      acceptance: p.acceptance
        ? { decision: p.acceptance.decision, decidedAt: p.acceptance.decidedAt, note: p.acceptance.note }
        : null,
    };
  }

  /**
   * Record the client's decision on a proposal.
   *
   * Rules:
   *  - ACCEPTED is terminal: once accepted, the proposal is locked
   *    and any further /decide call gets rejected. We assume the
   *    project pipeline has already moved on, so silently flipping
   *    back would be surprising and disruptive.
   *  - REJECTED → ACCEPTED is allowed: the client can change their
   *    mind after a rejection. We delete the old acceptance row and
   *    create a fresh one so the audit trail reflects the final
   *    decision.
   *  - SENT → ACCEPTED or REJECTED is the normal first-time flow.
   *  - Any other status (DRAFT, EXPIRED) is rejected.
   */
  async decide(
    clientId: string,
    contactId: string,
    proposalId: string,
    dto: DecideDto,
    ip: string,
    userAgent: string,
  ) {
    const p = await this.prisma.proposal.findFirst({ where: { id: proposalId, clientId } });
    if (!p) throw new NotFoundException();
    if (p.status === "ACCEPTED") {
      throw new ConflictException("already-accepted");
    }
    if (p.status !== "SENT" && p.status !== "REJECTED") {
      throw new ConflictException(`Cannot change a ${p.status.toLowerCase()} proposal.`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Drop any prior acceptance row so the unique-on-proposalId
      // constraint doesn't fight us when a client flips REJECTED →
      // ACCEPTED. Idempotent — deleteMany is a no-op when there's
      // nothing to delete.
      await tx.proposalAcceptance.deleteMany({ where: { proposalId } });
      await tx.proposalAcceptance.create({
        data: { proposalId, contactId, decision: dto.decision, note: dto.note ?? null, ip, userAgent },
      });
      await tx.proposal.update({
        where: { id: proposalId },
        data: { status: dto.decision },
      });
      return { ok: true };
    });

    // Notify the staff member who prepared the proposal AND admins/CEO
    // so leadership sees client decisions without polling. Best-effort:
    // a notify failure must NOT roll back the decision write above.
    try {
      const accepted = dto.decision === "ACCEPTED";
      const admins = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        },
        select: { id: true },
      });
      const recipients = new Set<string>([p.createdById, ...admins.map((u) => u.id)]);
      const title = accepted ? `Proposal accepted: ${p.projectName}` : `Proposal rejected: ${p.projectName}`;
      const body = dto.note
        ? `Client note: "${dto.note}"`
        : accepted
          ? "The client accepted the proposal. Time to kick off."
          : "The client rejected the proposal. Check the note (if any) and follow up.";
      await Promise.all(
        Array.from(recipients).map((uid) =>
          this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title,
            body,
            link: `/proposals/${proposalId}`,
          }).catch(() => undefined),
        ),
      );
    } catch {
      /* non-fatal */
    }

    return result;
  }
}
