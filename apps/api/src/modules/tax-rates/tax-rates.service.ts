import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateTaxRateDto, UpdateTaxRateDto } from "./dto/tax-rate.dto";

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.taxRate.findMany({ orderBy: { rate: "asc" } });
  }

  async findOne(id: string) {
    const rate = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException("Tax rate not found.");
    return rate;
  }

  create(dto: CreateTaxRateDto) {
    return this.prisma.taxRate.create({ data: dto });
  }

  update(id: string, dto: UpdateTaxRateDto) {
    return this.prisma.taxRate.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.taxRate.delete({ where: { id } });
    return { success: true };
  }

  async seedDefaults() {
    const count = await this.prisma.taxRate.count();
    if (count > 0) return { seeded: false, count };
    const defaults = [
      { name: "GST 5%", rate: 5, type: "GST" },
      { name: "GST 12%", rate: 12, type: "GST" },
      { name: "GST 18%", rate: 18, type: "GST" },
      { name: "GST 28%", rate: 28, type: "GST" },
    ];
    await this.prisma.taxRate.createMany({ data: defaults });
    return { seeded: true, count: defaults.length };
  }
}
