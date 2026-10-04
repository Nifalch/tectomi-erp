import { Injectable, NotFoundException } from "@nestjs/common";
import { ActivityAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateProjectExpenseDto } from "./dto/create-project-expense.dto";
import { UpdateProjectExpenseDto } from "./dto/update-project-expense.dto";

@Injectable()
export class ProjectExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private baseInclude = {
    vendor: true,
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    project: { select: { id: true, name: true } },
  };

  /** Best-effort activity audit. Never throws. */
  private async logActivity(
    userId: string | undefined,
    action: ActivityAction,
    expense: { id: string; description: string; projectId: string },
    details?: string,
  ) {
    if (!userId) return;
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          entityType: "project_expense",
          entityId: expense.id,
          entityName: expense.description,
          details,
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  async findAll(projectId?: string) {
    const where: Prisma.ProjectExpenseWhereInput = projectId ? { projectId } : {};
    return this.prisma.projectExpense.findMany({
      where,
      include: this.baseInclude,
      orderBy: { incurredAt: "desc" },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.projectExpense.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!expense) throw new NotFoundException("Project expense not found.");
    return expense;
  }

  async create(dto: CreateProjectExpenseDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const created = await this.prisma.projectExpense.create({
      data: {
        projectId: dto.projectId,
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        incurredAt: new Date(dto.incurredAt),
        recurring: dto.recurring ?? false,
        recurrenceMonths: dto.recurrenceMonths,
        notes: dto.notes,
        vendorId: dto.vendorId,
        createdById: userId,
      },
      include: this.baseInclude,
    });

    await this.logActivity(
      userId,
      ActivityAction.CREATED,
      created,
      `expense logged: $${dto.amount} — ${dto.description}`,
    );
    return created;
  }

  async update(id: string, dto: UpdateProjectExpenseDto, userId: string) {
    const existing = await this.prisma.projectExpense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Project expense not found.");

    const updated = await this.prisma.projectExpense.update({
      where: { id },
      data: {
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
        recurring: dto.recurring,
        recurrenceMonths: dto.recurrenceMonths,
        notes: dto.notes,
        vendorId: dto.vendorId,
      },
      include: this.baseInclude,
    });

    await this.logActivity(userId, ActivityAction.UPDATED, updated);
    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.projectExpense.findUnique({
      where: { id },
      select: { id: true, description: true, projectId: true },
    });
    if (!existing) return { success: true, alreadyDeleted: true };
    try {
      await this.prisma.projectExpense.delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === "P2025") {
        return { success: true, alreadyDeleted: true };
      }
      throw err;
    }
    await this.logActivity(userId, ActivityAction.DELETED, existing);
    return { success: true };
  }

  async summary(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found.");

    const grouped = await this.prisma.projectExpense.groupBy({
      by: ["category"],
      where: { projectId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    let totalAmount = 0;
    const byCategory = grouped.map((g) => {
      const amount = Number(g._sum.amount ?? 0);
      totalAmount += amount;
      return {
        category: g.category,
        amount: Math.round(amount * 100) / 100,
        count: g._count._all,
      };
    });

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      byCategory: byCategory.sort((a, b) => b.amount - a.amount),
    };
  }
}
