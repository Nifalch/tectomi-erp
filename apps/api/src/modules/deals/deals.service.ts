import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DealStage, NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateDealDto, UpdateDealDto } from "./dto/deal.dto";

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: PaginationDto & { stage?: DealStage; ownerId?: string; clientId?: string }) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.DealWhereInput = {};
    if (query.stage) where.stage = query.stage;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        include: { client: true, contact: true, owner: true },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        client: true,
        contact: true,
        owner: true,
        lead: true,
        activities: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!deal) {
      throw new NotFoundException("Deal not found.");
    }
    return deal;
  }

  async create(actorId: string, dto: CreateDealDto) {
    const { leadId, expectedCloseDate, ...rest } = dto;
    // Default owner to the user creating the deal, and amount to 0 if the
    // form left it blank — the schema marks both as required, so we fill
    // them in here rather than failing validation in front of the user.
    const ownerId = rest.ownerId ?? actorId;
    const amount = rest.amount != null ? new Prisma.Decimal(rest.amount) : new Prisma.Decimal(0);
    const data: Prisma.DealCreateInput = {
      name: rest.name,
      amount,
      client: { connect: { id: rest.clientId } },
      owner: { connect: { id: ownerId } },
    };
    if (rest.contactId) data.contact = { connect: { id: rest.contactId } };
    if (rest.stage) data.stage = rest.stage;
    if (rest.probability !== undefined) data.probability = rest.probability;
    if (expectedCloseDate) data.expectedCloseDate = new Date(expectedCloseDate);
    if (rest.description) data.description = rest.description;
    if (rest.source) data.source = rest.source;
    if (leadId) data.lead = { connect: { id: leadId } };

    return this.prisma.deal.create({
      data,
      include: { client: true, contact: true, owner: true, lead: true },
    });
  }

  async update(id: string, dto: UpdateDealDto) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) {
      throw new NotFoundException("Deal not found.");
    }

    const data: Prisma.DealUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.clientId !== undefined) data.client = { connect: { id: dto.clientId } };
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId ? { connect: { id: dto.contactId } } : { disconnect: true };
    }
    if (dto.stage !== undefined) {
      data.stage = dto.stage;
      if (dto.stage === DealStage.CLOSED_WON || dto.stage === DealStage.CLOSED_LOST) {
        data.actualCloseDate = new Date();
      }
    }
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.probability !== undefined) data.probability = dto.probability;
    if (dto.expectedCloseDate !== undefined) data.expectedCloseDate = new Date(dto.expectedCloseDate);
    if (dto.actualCloseDate !== undefined) data.actualCloseDate = new Date(dto.actualCloseDate);
    if (dto.ownerId !== undefined) data.owner = { connect: { id: dto.ownerId } };
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.lostReason !== undefined) data.lostReason = dto.lostReason;
    if (dto.source !== undefined) data.source = dto.source;

    const updated = await this.prisma.deal.update({
      where: { id },
      data,
      include: { client: true, contact: true, owner: true, lead: true },
    });

    // Fire a notification on stage → CLOSED_WON / CLOSED_LOST. Goes to
    // admins + the deal owner (excluded if they were the one who closed
    // it themselves, since we don't have actorId here). Best-effort.
    if (
      dto.stage !== undefined &&
      deal.stage !== dto.stage &&
      (dto.stage === DealStage.CLOSED_WON || dto.stage === DealStage.CLOSED_LOST)
    ) {
      try {
        const won = dto.stage === DealStage.CLOSED_WON;
        const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
        const amountStr = updated.amount ? fmtMoney(Number(updated.amount)) : null;
        const admins = await this.prisma.user.findMany({
          where: {
            status: "ACTIVE",
            roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
          },
          select: { id: true },
        });
        const recipients = new Set<string>(admins.map((u) => u.id));
        if (updated.ownerId) recipients.add(updated.ownerId);
        const company = updated.client?.companyName ?? "Client";
        await Promise.all(
          Array.from(recipients).map((uid) =>
            this.notifications.create(uid, {
              type: NotificationType.GENERIC,
              title: won
                ? `Deal won: ${updated.name}`
                : `Deal lost: ${updated.name}`,
              body: won
                ? `${company}${amountStr ? ` · ${amountStr}` : ""} — congrats! Time to onboard.`
                : `${company}${updated.lostReason ? ` — ${updated.lostReason}` : ""}. Worth a debrief.`,
              link: `/leads`,
            }).catch(() => undefined),
          ),
        );
      } catch {
        /* non-fatal */
      }
    }

    return updated;
  }

  async remove(id: string) {
    return this.prisma.deal.delete({ where: { id } });
  }

  async convertFromLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { convertedTo: true, deal: true },
    });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }
    if (lead.deal) {
      throw new BadRequestException("Lead already converted to a deal.");
    }
    if (!lead.assignedToId) {
      throw new BadRequestException("Lead must have an assignee to be converted to a deal.");
    }

    let clientId = lead.convertedToId;
    if (!clientId) {
      const client = await this.prisma.client.create({
        data: {
          companyName: lead.companyName,
          contactPerson: lead.contactName,
          email: lead.email,
          phone: lead.phone,
        },
      });
      clientId = client.id;
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { convertedToId: clientId, status: "WON" },
      });
    }

    const amount = lead.estimatedValue ?? new Prisma.Decimal(0);

    return this.prisma.deal.create({
      data: {
        name: `${lead.companyName} — ${lead.contactName}`,
        client: { connect: { id: clientId } },
        owner: { connect: { id: lead.assignedToId } },
        amount,
        lead: { connect: { id: leadId } },
      },
      include: { client: true, contact: true, owner: true, lead: true },
    });
  }
}
