import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.calendarEvent.findMany({
      include: {
        organizer: true,
      },
      orderBy: { startTime: "asc" },
    });
  }

  async create(
    organizerId: string,
    dto: {
      title: string;
      description?: string;
      type?: string;
      startTime: Date;
      endTime: Date;
      allDay?: boolean;
      location?: string;
    },
  ) {
    return this.prisma.calendarEvent.create({
      data: {
        ...dto,
        organizerId,
      } as any,
      include: { organizer: true },
    });
  }

  async update(id: string, dto: Record<string, any>) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException("Calendar event not found.");
    }
    return this.prisma.calendarEvent.update({
      where: { id },
      data: dto as any,
      include: { organizer: true },
    });
  }

  async remove(id: string) {
    return this.prisma.calendarEvent.delete({ where: { id } });
  }
}
