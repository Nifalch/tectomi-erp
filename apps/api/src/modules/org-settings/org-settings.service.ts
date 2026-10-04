import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { UpdateOrgSettingsDto } from "./dto/org-settings.dto";

@Injectable()
export class OrgSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.organizationSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.organizationSettings.create({ data: {} });
    }
    return settings;
  }

  async update(dto: UpdateOrgSettingsDto) {
    const existing = await this.prisma.organizationSettings.findFirst();
    if (!existing) {
      return this.prisma.organizationSettings.create({ data: dto });
    }
    return this.prisma.organizationSettings.update({
      where: { id: existing.id },
      data: dto,
    });
  }
}
