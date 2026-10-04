import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where = query.search
      ? {
          OR: [
            { companyName: { contains: query.search, mode: "insensitive" as const } },
            { contactName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(dto: {
    companyName: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    category?: string;
    notes?: string;
    status?: string;
  }) {
    return this.prisma.vendor.create({ data: dto });
  }

  async update(id: string, dto: Record<string, any>) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException("Vendor not found.");
    }
    return this.prisma.vendor.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.vendor.delete({ where: { id } });
  }
}
