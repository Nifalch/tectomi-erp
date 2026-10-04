import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateResourceAllocationDto } from "./dto/create-resource-allocation.dto";

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.resourceAllocation.findMany({
      include: {
        user: true,
        project: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(dto: CreateResourceAllocationDto) {
    return this.prisma.resourceAllocation.create({
      data: {
        userId: dto.userId,
        projectId: dto.projectId,
        allocatedHours: dto.allocatedHours,
        roleLabel: dto.roleLabel,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async update(id: string, dto: Partial<CreateResourceAllocationDto>) {
    const data: Record<string, unknown> = {};
    if (dto.userId !== undefined) data.userId = dto.userId;
    if (dto.projectId !== undefined) data.projectId = dto.projectId;
    if (dto.allocatedHours !== undefined) data.allocatedHours = dto.allocatedHours;
    if (dto.roleLabel !== undefined) data.roleLabel = dto.roleLabel;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    return this.prisma.resourceAllocation.update({
      where: { id },
      data,
      include: { user: true, project: true },
    });
  }

  async remove(id: string) {
    return this.prisma.resourceAllocation.delete({
      where: { id },
    });
  }
}
