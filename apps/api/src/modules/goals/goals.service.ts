import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { GoalType, RoleCode } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

const ADMIN_ROLES: readonly string[] = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN];

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admins can touch any goal; everyone else can only touch goals they own. */
  private assertCanMutate(goal: { assigneeId: string }, caller: { id: string; roles: string[] }) {
    const isAdmin = caller.roles.some((r) => ADMIN_ROLES.includes(r));
    if (isAdmin) return;
    if (goal.assigneeId !== caller.id) {
      throw new ForbiddenException("You can only modify goals assigned to you.");
    }
  }

  async findAll() {
    return this.prisma.goal.findMany({
      include: {
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Map UI-friendly status values to the actual `GoalStatus` Prisma enum.
   * Legacy frontends shipped with "ACTIVE" / "ON_TRACK" / "AT_RISK" / "BEHIND"
   * which don't exist in the DB enum — translate them rather than 400.
   */
  private normalizeStatus(s?: string | null): string | undefined {
    if (!s) return undefined;
    const map: Record<string, string> = {
      ACTIVE: "IN_PROGRESS",
      ON_TRACK: "IN_PROGRESS",
      AT_RISK: "IN_PROGRESS",
      BEHIND: "IN_PROGRESS",
      NOT_STARTED: "NOT_STARTED",
      IN_PROGRESS: "IN_PROGRESS",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    };
    return map[s] ?? "NOT_STARTED";
  }

  async create(dto: {
    title: string;
    description?: string;
    type?: GoalType;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    status?: string;
    startDate?: Date;
    dueDate?: Date;
    assigneeId: string;
  }) {
    const data: any = { ...dto };
    if (dto.status) data.status = this.normalizeStatus(dto.status);
    return this.prisma.goal.create({
      data,
      include: { assignee: true },
    });
  }

  async update(id: string, dto: Record<string, any>, caller: { id: string; roles: string[] }) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) {
      throw new NotFoundException("Goal not found.");
    }
    this.assertCanMutate(goal, caller);
    return this.prisma.goal.update({
      where: { id },
      data: dto as any,
      include: { assignee: true },
    });
  }

  async remove(id: string, caller: { id: string; roles: string[] }) {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal) {
      throw new NotFoundException("Goal not found.");
    }
    this.assertCanMutate(goal, caller);
    return this.prisma.goal.delete({ where: { id } });
  }
}
