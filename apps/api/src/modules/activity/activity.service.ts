import { Injectable } from "@nestjs/common";
import { ActivityAction } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.activityLog.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async log(
    userId: string,
    action: ActivityAction,
    entityType: string,
    entityId?: string,
    entityName?: string,
    details?: string,
  ) {
    return this.prisma.activityLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        entityName,
        details,
      },
    });
  }
}
