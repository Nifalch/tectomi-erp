import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateItemDto, UpdateItemDto } from "./dto/item.dto";

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        include: { incomeAccount: true, expenseAccount: true, taxRate: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.item.count(),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { incomeAccount: true, expenseAccount: true, taxRate: true },
    });
    if (!item) throw new NotFoundException("Item not found.");
    return item;
  }

  create(dto: CreateItemDto) {
    return this.prisma.item.create({ data: dto });
  }

  update(id: string, dto: UpdateItemDto) {
    return this.prisma.item.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.item.delete({ where: { id } });
    return { success: true };
  }
}
