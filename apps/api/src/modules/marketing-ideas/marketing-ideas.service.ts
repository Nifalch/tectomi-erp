import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateMarketingIdeaDto,
  CreateMarketingIdeaTaskDto,
  ListMarketingIdeasQueryDto,
  UpdateMarketingIdeaDto,
  UpdateMarketingIdeaTaskDto,
} from "./dto/marketing-idea.dto";

// Shared include block — every list / detail / mutation response uses this so
// the front-end always sees the same shape (owner avatar, task counts, etc.).
const IDEA_INCLUDE = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  tasks: {
    orderBy: { sortOrder: "asc" },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
    },
  },
  _count: { select: { tasks: true, socialPosts: true } },
} satisfies Prisma.MarketingIdeaInclude;

@Injectable()
export class MarketingIdeasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListMarketingIdeasQueryDto) {
    const where: Prisma.MarketingIdeaWhereInput = {
      AND: [
        query.stage ? { stage: query.stage } : {},
        query.priority ? { priority: query.priority } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.tag ? { tags: { has: query.tag } } : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { content: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    return this.prisma.marketingIdea.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: IDEA_INCLUDE,
    });
  }

  async get(id: string) {
    const idea = await this.prisma.marketingIdea.findUnique({
      where: { id },
      include: {
        ...IDEA_INCLUDE,
        socialPosts: {
          orderBy: { scheduledAt: "asc" },
          select: {
            id: true, title: true, content: true, platform: true, status: true,
            scheduledAt: true, publishedAt: true, link: true,
          },
        },
      },
    });
    if (!idea) throw new NotFoundException("Marketing idea not found");
    return idea;
  }

  create(userId: string, dto: CreateMarketingIdeaDto) {
    return this.prisma.marketingIdea.create({
      data: {
        title: dto.title,
        description: dto.description,
        content: dto.content,
        stage: dto.stage,
        priority: dto.priority,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        tags: dto.tags ?? [],
        ownerId: userId,
      },
      include: IDEA_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateMarketingIdeaDto) {
    const data: Prisma.MarketingIdeaUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.stage !== undefined) data.stage = dto.stage;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.targetDate !== undefined) data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.tags !== undefined) data.tags = dto.tags;
    return this.prisma.marketingIdea.update({
      where: { id },
      data,
      include: IDEA_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.prisma.marketingIdea.delete({ where: { id } });
    return { success: true };
  }

  // ── Checklist tasks ────────────────────────────────────────────────────────

  async addTask(ideaId: string, dto: CreateMarketingIdeaTaskDto) {
    return this.prisma.marketingIdeaTask.create({
      data: {
        marketingIdeaId: ideaId,
        title: dto.title,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
  }

  async updateTask(taskId: string, dto: UpdateMarketingIdeaTaskDto) {
    const data: Prisma.MarketingIdeaTaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.completed !== undefined) data.completed = dto.completed;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    return this.prisma.marketingIdeaTask.update({
      where: { id: taskId },
      data,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
  }

  async removeTask(taskId: string) {
    await this.prisma.marketingIdeaTask.delete({ where: { id: taskId } });
    return { success: true };
  }
}
