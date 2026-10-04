import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, module?: string) {
    return this.prisma.savedView.findMany({
      where: { userId, ...(module ? { module } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(userId: string, dto: { module: string; name: string; filters: unknown; isDefault?: boolean }) {
    // If marked default, un-flag other defaults on the same module.
    if (dto.isDefault) {
      await this.prisma.savedView.updateMany({
        where: { userId, module: dto.module, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.savedView.create({
      data: {
        userId,
        module: dto.module,
        name: dto.name,
        filters: dto.filters as any,
        isDefault: !!dto.isDefault,
      },
    });
  }

  async update(
    userId: string,
    id: string,
    dto: { name?: string; filters?: unknown; isDefault?: boolean },
  ) {
    const existing = await this.prisma.savedView.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Saved view not found.");

    if (dto.isDefault) {
      await this.prisma.savedView.updateMany({
        where: { userId, module: existing.module, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedView.update({
      where: { id },
      data: {
        name: dto.name,
        filters: dto.filters as any,
        isDefault: dto.isDefault,
      },
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.savedView.findFirst({ where: { id, userId } });
    if (!existing) return { success: true, alreadyDeleted: true };
    await this.prisma.savedView.delete({ where: { id } });
    return { success: true };
  }
}
