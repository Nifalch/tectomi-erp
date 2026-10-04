import { Injectable, NotFoundException } from "@nestjs/common";
import { AssetStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getPagination } from "../../common/pagination/pagination.dto";
import {
  AssignAssetDto,
  CreateAssetDto,
  ListAssetsDto,
  UpdateAssetDto,
} from "./dto/asset.dto";

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAssetsDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.AssetWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.category) where.category = query.category;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        skip,
        take,
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async get(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });
    if (!asset) throw new NotFoundException("Asset not found");
    return asset;
  }

  async create(dto: CreateAssetDto) {
    return this.prisma.asset.create({
      data: {
        name: dto.name,
        category: dto.category,
        serialNumber: dto.serialNumber,
        model: dto.model,
        manufacturer: dto.manufacturer,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        purchasePrice: dto.purchasePrice != null ? new Prisma.Decimal(dto.purchasePrice) : undefined,
        notes: dto.notes,
        // Honour the form's status pick (Available, Under Repair, etc.) and
        // fall back to AVAILABLE for callers that don't supply one.
        status: dto.status ?? AssetStatus.AVAILABLE,
      },
    });
  }

  async update(id: string, dto: UpdateAssetDto) {
    const data: Prisma.AssetUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.manufacturer !== undefined) data.manufacturer = dto.manufacturer;
    if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);
    if (dto.purchasePrice !== undefined) data.purchasePrice = new Prisma.Decimal(dto.purchasePrice);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.asset.update({ where: { id }, data });
  }

  async assign(id: string, dto: AssignAssetDto) {
    return this.prisma.asset.update({
      where: { id },
      data: {
        assignedToId: dto.userId,
        assignedAt: new Date(),
        status: AssetStatus.ASSIGNED,
      },
    });
  }

  async unassign(id: string) {
    return this.prisma.asset.update({
      where: { id },
      data: {
        assignedToId: null,
        assignedAt: null,
        status: AssetStatus.AVAILABLE,
      },
    });
  }

  async remove(id: string) {
    await this.prisma.asset.delete({ where: { id } });
    return { success: true };
  }
}
