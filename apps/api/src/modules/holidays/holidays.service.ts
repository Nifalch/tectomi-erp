import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateHolidayDto } from "./dto/create-holiday.dto";

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.holiday.findMany({
      orderBy: { date: "asc" },
    });
  }

  async create(dto: CreateHolidayDto) {
    return this.prisma.holiday.create({
      data: {
        name: dto.name,
        date: new Date(dto.date),
        type: dto.type,
        description: dto.description,
      },
    });
  }

  async update(id: string, dto: Partial<CreateHolidayDto>) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description;
    return this.prisma.holiday.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }
}
