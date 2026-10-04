import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
} from "./dto/project-status.dto";

@Injectable()
export class ProjectStatusesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(projectId: string) {
    return this.prisma.projectTaskStatus.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(dto: CreateProjectStatusDto) {
    if (dto.isDefault) {
      await this.prisma.projectTaskStatus.updateMany({
        where: { projectId: dto.projectId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.projectTaskStatus.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
        isDone: dto.isDone ?? false,
        isDefault: dto.isDefault ?? false,
        category: dto.category ?? "TODO",
      },
    });
  }

  async update(id: string, dto: UpdateProjectStatusDto) {
    const existing = await this.prisma.projectTaskStatus.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Project status not found.");

    if (dto.isDefault) {
      await this.prisma.projectTaskStatus.updateMany({
        where: { projectId: existing.projectId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isDone !== undefined) data.isDone = dto.isDone;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
    if (dto.category !== undefined) data.category = dto.category;

    return this.prisma.projectTaskStatus.update({ where: { id }, data });
  }

  async remove(id: string) {
    const tasksUsing = await this.prisma.task.count({ where: { customStatusId: id } });
    if (tasksUsing > 0) {
      throw new BadRequestException(
        `Cannot delete this status — ${tasksUsing} task(s) are still using it. Reassign those tasks first.`,
      );
    }
    await this.prisma.projectTaskStatus.delete({ where: { id } });
    return { success: true };
  }
}
