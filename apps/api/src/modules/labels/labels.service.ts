import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface CreateLabelInput {
  name: string;
  color?: string;
  projectId?: string;
}

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId?: string) {
    const where = projectId ? { projectId } : {};
    return this.prisma.label.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async create(dto: CreateLabelInput) {
    return this.prisma.label.create({
      data: {
        name: dto.name,
        color: dto.color,
        projectId: dto.projectId,
      },
    });
  }

  async update(id: string, dto: Partial<CreateLabelInput>) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.projectId !== undefined) data.projectId = dto.projectId;
    return this.prisma.label.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.label.delete({ where: { id } });
  }
}
