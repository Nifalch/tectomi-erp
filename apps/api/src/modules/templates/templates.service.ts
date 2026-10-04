import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.emailTemplate.findMany({
      include: {
        createdBy: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    createdById: string,
    dto: {
      name: string;
      subject: string;
      body: string;
      category?: string;
    },
  ) {
    return this.prisma.emailTemplate.create({
      data: {
        ...dto,
        createdById,
      },
      include: { createdBy: true },
    });
  }

  async update(id: string, dto: Record<string, any>) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException("Email template not found.");
    }
    return this.prisma.emailTemplate.update({
      where: { id },
      data: dto,
      include: { createdBy: true },
    });
  }

  async remove(id: string) {
    return this.prisma.emailTemplate.delete({ where: { id } });
  }
}
