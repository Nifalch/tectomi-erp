import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomFieldType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface CreateCustomFieldDto {
  entity: string;
  key: string;
  label: string;
  type?: CustomFieldType;
  options?: string[];
  required?: boolean;
  sortOrder?: number;
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(entity?: string) {
    return this.prisma.customFieldDef.findMany({
      where: entity ? { entity } : {},
      orderBy: [{ entity: "asc" }, { sortOrder: "asc" }],
    });
  }

  create(dto: CreateCustomFieldDto) {
    return this.prisma.customFieldDef.create({
      data: {
        entity: dto.entity,
        key: dto.key.replace(/\W+/g, "_").toLowerCase(),
        label: dto.label,
        type: dto.type ?? CustomFieldType.TEXT,
        options: dto.options ?? [],
        required: dto.required ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: Partial<CreateCustomFieldDto>) {
    const existing = await this.prisma.customFieldDef.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Custom field not found.");

    return this.prisma.customFieldDef.update({
      where: { id },
      data: {
        label: dto.label,
        type: dto.type,
        options: dto.options,
        required: dto.required,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.customFieldDef.findUnique({ where: { id } });
    if (!existing) return { success: true, alreadyDeleted: true };
    await this.prisma.customFieldDef.delete({ where: { id } });
    return { success: true };
  }
}
