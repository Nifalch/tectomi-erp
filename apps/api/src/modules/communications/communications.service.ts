import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId?: string, leadId?: string) {
    const where: Record<string, any> = {};
    if (clientId) where.clientId = clientId;
    if (leadId) where.leadId = leadId;

    return this.prisma.communication.findMany({
      where,
      include: {
        createdBy: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    createdById: string,
    dto: {
      clientId?: string;
      leadId?: string;
      type: string;
      subject?: string;
      content?: string;
      direction?: string;
    },
  ) {
    return this.prisma.communication.create({
      data: {
        ...dto,
        subject: dto.subject ?? "",
        createdById,
      } as any,
      include: { createdBy: true },
    });
  }
}
