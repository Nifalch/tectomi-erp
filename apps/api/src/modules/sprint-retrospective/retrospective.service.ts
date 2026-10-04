import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { UpsertRetrospectiveDto } from "./dto/retrospective.dto";

@Injectable()
export class SprintRetrospectiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Loads sprint & its projectId. Throws if missing. */
  private async loadSprintOrFail(sprintId: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, projectId: true },
    });
    if (!sprint) throw new NotFoundException("Sprint not found.");
    return sprint;
  }

  /** Non-admins must have access to the sprint's project. */
  async assertCanRead(sprintId: string, user: { id: string; roles?: any }, isAdmin: boolean) {
    const sprint = await this.loadSprintOrFail(sprintId);
    if (isAdmin) return sprint;
    const allowed = await this.projectsService.userHasProjectAccess(sprint.projectId, user.id);
    if (!allowed) throw new ForbiddenException("You don't have access to this sprint.");
    return sprint;
  }

  async get(sprintId: string) {
    await this.loadSprintOrFail(sprintId);
    return this.prisma.sprintRetrospective.findUnique({
      where: { sprintId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });
  }

  async upsert(sprintId: string, dto: UpsertRetrospectiveDto, actorId: string) {
    await this.loadSprintOrFail(sprintId);
    const existing = await this.prisma.sprintRetrospective.findUnique({ where: { sprintId } });
    if (existing) {
      return this.prisma.sprintRetrospective.update({
        where: { sprintId },
        data: {
          wentWell: dto.wentWell ?? existing.wentWell,
          toImprove: dto.toImprove ?? existing.toImprove,
          actionItems: dto.actionItems ?? existing.actionItems,
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });
    }
    return this.prisma.sprintRetrospective.create({
      data: {
        sprintId,
        wentWell: dto.wentWell ?? null,
        toImprove: dto.toImprove ?? null,
        actionItems: dto.actionItems ?? null,
        createdById: actorId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  async remove(sprintId: string) {
    await this.loadSprintOrFail(sprintId);
    try {
      await this.prisma.sprintRetrospective.delete({ where: { sprintId } });
    } catch {
      /* already gone — idempotent */
    }
    return { success: true };
  }
}
