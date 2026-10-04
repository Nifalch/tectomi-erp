import { Injectable, NotFoundException } from "@nestjs/common";
import { Frequency, RecurringStatus, SprintStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { advanceMonth } from "../../common/util/date.util";
import {
  CreateRecurringTaskDto,
  UpdateRecurringTaskDto,
} from "./dto/recurring-task.dto";

@Injectable()
export class RecurringTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private baseInclude = {
    project: { select: { id: true, name: true, status: true } },
    assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  };

  private advance(date: Date, frequency: Frequency, dayOfMonth?: number | null): Date {
    const d = new Date(date);
    switch (frequency) {
      case Frequency.DAILY:
        d.setDate(d.getDate() + 1);
        break;
      case Frequency.WEEKLY:
        d.setDate(d.getDate() + 7);
        break;
      case Frequency.MONTHLY:
        // Bare `setMonth(+1)` overflows on Jan 31 → "Feb 31" → JS rolls to
        // Mar 3, silently skipping February's run. Clamp to the last day
        // of the target month instead so monthly recurrences land on the
        // closest valid date (Jan 31 → Feb 28/29, May 31 → Jun 30).
        advanceMonth(d, 1, dayOfMonth ?? null);
        break;
      case Frequency.QUARTERLY:
        advanceMonth(d, 3, dayOfMonth ?? null);
        break;
      case Frequency.YEARLY:
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    return d;
  }

  async findAll(query: PaginationDto, projectId?: string) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (query.search) where.title = { contains: query.search, mode: "insensitive" };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.recurringTaskTemplate.findMany({
        where,
        include: this.baseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.recurringTaskTemplate.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const r = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!r) throw new NotFoundException("Recurring task template not found.");
    return r;
  }

  async create(createdById: string, dto: CreateRecurringTaskDto) {
    const startDate = new Date(dto.startDate);
    return this.prisma.recurringTaskTemplate.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assignedToId: dto.assignedToId || undefined,
        storyPoints: dto.storyPoints ?? undefined,
        estimatedHrs: dto.estimatedHrs ?? undefined,
        sprintAssign: dto.sprintAssign ?? false,
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek ?? undefined,
        dayOfMonth: dto.dayOfMonth ?? undefined,
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        nextRunAt: startDate,
        status: RecurringStatus.ACTIVE,
        createdById,
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateRecurringTaskDto) {
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId || null;
    if (dto.storyPoints !== undefined) data.storyPoints = dto.storyPoints;
    if (dto.estimatedHrs !== undefined) data.estimatedHrs = dto.estimatedHrs;
    if (dto.sprintAssign !== undefined) data.sprintAssign = dto.sprintAssign;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.dayOfWeek !== undefined) data.dayOfWeek = dto.dayOfWeek;
    if (dto.dayOfMonth !== undefined) data.dayOfMonth = dto.dayOfMonth;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) {
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    return this.prisma.recurringTaskTemplate.update({
      where: { id },
      data,
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    await this.prisma.recurringTaskTemplate.delete({ where: { id } });
    return { success: true };
  }

  pause(id: string) {
    return this.prisma.recurringTaskTemplate.update({
      where: { id },
      data: { status: RecurringStatus.PAUSED },
    });
  }
  resume(id: string) {
    return this.prisma.recurringTaskTemplate.update({
      where: { id },
      data: { status: RecurringStatus.ACTIVE },
    });
  }
  end(id: string) {
    return this.prisma.recurringTaskTemplate.update({
      where: { id },
      data: { status: RecurringStatus.ENDED },
    });
  }

  async runDue() {
    const today = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        status: RecurringStatus.ACTIVE,
        nextRunAt: { lte: today },
      },
    });

    const results: { id: string; nextTaskId: string }[] = [];

    for (const r of due) {
      let sprintId: string | undefined;
      if (r.sprintAssign) {
        const activeSprint = await this.prisma.sprint.findFirst({
          where: { projectId: r.projectId, status: SprintStatus.ACTIVE },
          orderBy: { startDate: "desc" },
        });
        if (activeSprint) sprintId = activeSprint.id;
      }

      const next = this.advance(r.nextRunAt, r.frequency, r.dayOfMonth);
      const shouldEnd = r.endDate && next > r.endDate;

      // Task spawn + template advance must commit together. Otherwise a crash
      // between the two leaves the template "already advanced" with no task,
      // or the task without the matching nextRunAt bump (and so the next
      // cron tick spawns a duplicate).
      const task = await this.prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            projectId: r.projectId,
            title: r.title,
            description: r.description ?? undefined,
            priority: r.priority,
            assignedToId: r.assignedToId ?? undefined,
            storyPoints: r.storyPoints ?? undefined,
            estimatedHrs: r.estimatedHrs ?? undefined,
            sprintId,
            recurringTaskId: r.id,
          },
        });
        await tx.recurringTaskTemplate.update({
          where: { id: r.id },
          data: {
            lastRunAt: today,
            nextRunAt: next,
            status: shouldEnd ? RecurringStatus.ENDED : r.status,
          },
        });
        return created;
      });

      results.push({ id: r.id, nextTaskId: task.id });
    }

    return { generated: results.length, templates: results };
  }
}
