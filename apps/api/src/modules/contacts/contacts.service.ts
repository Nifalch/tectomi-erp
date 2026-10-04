import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateContactDto, UpdateContactDto } from "./dto/contact.dto";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto & { clientId?: string }) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: any = {};
    if (query.clientId) {
      where.clientId = query.clientId;
    }
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" as const } },
        { lastName: { contains: query.search, mode: "insensitive" as const } },
        { email: { contains: query.search, mode: "insensitive" as const } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: { client: true },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        client: true,
        deals: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!contact) {
      throw new NotFoundException("Contact not found.");
    }
    return contact;
  }

  async create(dto: CreateContactDto) {
    return this.prisma.contact.create({ data: dto });
  }

  async update(id: string, dto: UpdateContactDto) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException("Contact not found.");
    }
    return this.prisma.contact.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.contact.delete({ where: { id } });
  }
}
