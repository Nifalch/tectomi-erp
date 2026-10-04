import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateProductIdeaDto,
  CreateProductIdeaTaskDto,
  ListProductIdeasQueryDto,
  UpdateProductIdeaDto,
  UpdateProductIdeaTaskDto,
} from "./dto/product-idea.dto";

const IDEA_INCLUDE = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  tasks: {
    orderBy: { sortOrder: "asc" },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
    },
  },
  // Lightweight projection — we only need who voted to compute "have I voted?"
  votes: { select: { id: true, userId: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.ProductIdeaInclude;

@Injectable()
export class ProductIdeasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductIdeasQueryDto) {
    const where: Prisma.ProductIdeaWhereInput = {
      AND: [
        query.status ? { status: query.status } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.tag ? { tags: { has: query.tag } } : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { rationale: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    return this.prisma.productIdea.findMany({
      where,
      orderBy: [
        // Highest-voted first inside each status, then most-recently updated
        // — gives the kanban a stable ranking even before votes accumulate.
        { voteCount: "desc" },
        { updatedAt: "desc" },
      ],
      include: IDEA_INCLUDE,
    });
  }

  async get(id: string) {
    const idea = await this.prisma.productIdea.findUnique({
      where: { id },
      include: IDEA_INCLUDE,
    });
    if (!idea) throw new NotFoundException("Product idea not found");
    return idea;
  }

  create(userId: string, dto: CreateProductIdeaDto) {
    return this.prisma.productIdea.create({
      data: {
        title: dto.title,
        description: dto.description,
        rationale: dto.rationale,
        successMetric: dto.successMetric,
        status: dto.status,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        tags: dto.tags ?? [],
        ownerId: userId,
      },
      include: IDEA_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProductIdeaDto) {
    const data: Prisma.ProductIdeaUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.rationale !== undefined) data.rationale = dto.rationale;
    if (dto.successMetric !== undefined) data.successMetric = dto.successMetric;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.targetDate !== undefined) data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.tags !== undefined) data.tags = dto.tags;
    return this.prisma.productIdea.update({
      where: { id },
      data,
      include: IDEA_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.prisma.productIdea.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Toggle the caller's vote. The cached `voteCount` on the idea moves with
   * the same transaction so the board can sort without recomputing.
   */
  async toggleVote(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.productIdeaVote.findUnique({
        where: { productIdeaId_userId: { productIdeaId: id, userId } },
      });
      if (existing) {
        await tx.productIdeaVote.delete({ where: { id: existing.id } });
        await tx.productIdea.update({
          where: { id },
          data: { voteCount: { decrement: 1 } },
        });
        return { voted: false };
      }
      await tx.productIdeaVote.create({
        data: { productIdeaId: id, userId },
      });
      await tx.productIdea.update({
        where: { id },
        data: { voteCount: { increment: 1 } },
      });
      return { voted: true };
    });
  }

  // ── Checklist tasks ────────────────────────────────────────────────────────

  async addTask(ideaId: string, dto: CreateProductIdeaTaskDto) {
    return this.prisma.productIdeaTask.create({
      data: {
        productIdeaId: ideaId,
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

  async updateTask(taskId: string, dto: UpdateProductIdeaTaskDto) {
    const data: Prisma.ProductIdeaTaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.completed !== undefined) data.completed = dto.completed;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    return this.prisma.productIdeaTask.update({
      where: { id: taskId },
      data,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
  }

  async removeTask(taskId: string) {
    await this.prisma.productIdeaTask.delete({ where: { id: taskId } });
    return { success: true };
  }
}
