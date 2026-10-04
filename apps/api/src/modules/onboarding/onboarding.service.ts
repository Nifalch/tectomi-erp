import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateOnboardingChecklistDto, ToggleOnboardingItemDto } from "./dto/create-onboarding.dto";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.onboardingChecklist.findMany({
      include: {
        items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(dto: CreateOnboardingChecklistDto) {
    const items = (dto.items ?? []).map((item, index) => ({
      title: item.title,
      assigneeId: item.assigneeId,
      sortOrder: index,
    }));
    return this.prisma.onboardingChecklist.create({
      data: {
        title: dto.title,
        description: dto.description,
        items: items.length ? { create: items } : undefined,
      },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
  }

  async toggleItem(checklistId: string, itemId: string, dto: ToggleOnboardingItemDto) {
    const item = await this.prisma.onboardingItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Onboarding item not found.");
    }
    if (item.checklistId !== checklistId) {
      throw new ForbiddenException("Item does not belong to this checklist.");
    }
    return this.prisma.onboardingItem.update({
      where: { id: itemId },
      data: { completed: dto.completed },
    });
  }

  async remove(id: string) {
    return this.prisma.onboardingChecklist.delete({ where: { id } });
  }
}
