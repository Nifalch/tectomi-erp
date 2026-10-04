import { Injectable, NotFoundException } from "@nestjs/common";
import { ActivityType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateActivityDto, UpdateActivityDto } from "./dto/activity.dto";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: PaginationDto & {
      leadId?: string;
      dealId?: string;
      clientId?: string;
      contactId?: string;
      type?: ActivityType;
    },
  ) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.ActivityWhereInput = {};
    if (query.leadId) where.leadId = query.leadId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: { createdBy: true, assignedTo: true },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: { createdBy: true, assignedTo: true, lead: true, deal: true, client: true, contact: true },
    });
    if (!activity) {
      throw new NotFoundException("Activity not found.");
    }
    return activity;
  }

  async create(createdById: string, dto: CreateActivityDto) {
    const data: Prisma.ActivityCreateInput = {
      type: dto.type,
      subject: dto.subject,
      createdBy: { connect: { id: createdById } },
    };
    if (dto.description) data.description = dto.description;
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.leadId) data.lead = { connect: { id: dto.leadId } };
    if (dto.dealId) data.deal = { connect: { id: dto.dealId } };
    if (dto.clientId) data.client = { connect: { id: dto.clientId } };
    if (dto.contactId) data.contact = { connect: { id: dto.contactId } };
    if (dto.assignedToId) data.assignedTo = { connect: { id: dto.assignedToId } };

    return this.prisma.activity.create({
      data,
      include: { createdBy: true, assignedTo: true },
    });
  }

  async update(id: string, dto: UpdateActivityDto) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Activity not found.");
    }

    const data: Prisma.ActivityUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);

    if (dto.completedAt !== undefined) {
      data.completedAt = new Date(dto.completedAt);
    } else if (dto.completed === true) {
      data.completedAt = new Date();
    }

    if (dto.leadId !== undefined) {
      data.lead = dto.leadId ? { connect: { id: dto.leadId } } : { disconnect: true };
    }
    if (dto.dealId !== undefined) {
      data.deal = dto.dealId ? { connect: { id: dto.dealId } } : { disconnect: true };
    }
    if (dto.clientId !== undefined) {
      data.client = dto.clientId ? { connect: { id: dto.clientId } } : { disconnect: true };
    }
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId ? { connect: { id: dto.contactId } } : { disconnect: true };
    }
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId ? { connect: { id: dto.assignedToId } } : { disconnect: true };
    }

    return this.prisma.activity.update({
      where: { id },
      data,
      include: { createdBy: true, assignedTo: true },
    });
  }

  async remove(id: string) {
    return this.prisma.activity.delete({ where: { id } });
  }
}
