import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountSubType, AccountType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateChartAccountDto, UpdateChartAccountDto } from "./dto/chart-account.dto";

@Injectable()
export class ChartAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.chartAccount.findMany({
      orderBy: { code: "asc" },
      include: { parent: true },
    });
  }

  async tree() {
    const all = await this.prisma.chartAccount.findMany({
      orderBy: { code: "asc" },
    });
    const byType: Record<string, typeof all> = {};
    for (const t of Object.values(AccountType)) byType[t] = [];
    for (const a of all) byType[a.type].push(a);

    const buildTree = (items: typeof all) => {
      const map = new Map<string, any>();
      items.forEach((i) => map.set(i.id, { ...i, children: [] }));
      const roots: any[] = [];
      items.forEach((i) => {
        if (i.parentId && map.has(i.parentId)) {
          map.get(i.parentId).children.push(map.get(i.id));
        } else {
          roots.push(map.get(i.id));
        }
      });
      return roots;
    };

    const result: Record<string, any[]> = {};
    for (const type of Object.keys(byType)) {
      result[type] = buildTree(byType[type]);
    }
    return result;
  }

  async findOne(id: string) {
    const account = await this.prisma.chartAccount.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });
    if (!account) throw new NotFoundException("Chart account not found.");
    return account;
  }

  create(dto: CreateChartAccountDto) {
    return this.prisma.chartAccount.create({ data: dto });
  }

  update(id: string, dto: UpdateChartAccountDto) {
    return this.prisma.chartAccount.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.chartAccount.delete({ where: { id } });
    return { success: true };
  }

  async seedDefaults() {
    const existing = await this.prisma.chartAccount.count();
    if (existing > 0) return { seeded: false, count: existing };

    const defaults: Array<{
      code: string;
      name: string;
      type: AccountType;
      subType: AccountSubType;
    }> = [
      { code: "1000", name: "Cash", type: AccountType.ASSET, subType: AccountSubType.CASH },
      { code: "1010", name: "Bank", type: AccountType.ASSET, subType: AccountSubType.BANK },
      { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET, subType: AccountSubType.ACCOUNTS_RECEIVABLE },
      { code: "1200", name: "Inventory", type: AccountType.ASSET, subType: AccountSubType.CURRENT_ASSET },
      { code: "1500", name: "Fixed Assets", type: AccountType.ASSET, subType: AccountSubType.FIXED_ASSET },
      { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY, subType: AccountSubType.ACCOUNTS_PAYABLE },
      { code: "2100", name: "GST Payable", type: AccountType.LIABILITY, subType: AccountSubType.TAX_PAYABLE },
      { code: "2200", name: "Short-Term Loans", type: AccountType.LIABILITY, subType: AccountSubType.CURRENT_LIABILITY },
      { code: "3000", name: "Owner's Equity", type: AccountType.EQUITY, subType: AccountSubType.OWNER_EQUITY },
      { code: "3100", name: "Retained Earnings", type: AccountType.EQUITY, subType: AccountSubType.RETAINED_EARNINGS },
      { code: "4000", name: "Sales", type: AccountType.INCOME, subType: AccountSubType.OPERATING_REVENUE },
      { code: "4100", name: "Service Revenue", type: AccountType.INCOME, subType: AccountSubType.OPERATING_REVENUE },
      { code: "4900", name: "Other Income", type: AccountType.INCOME, subType: AccountSubType.OTHER_INCOME },
      { code: "5000", name: "Purchases", type: AccountType.EXPENSE, subType: AccountSubType.COST_OF_GOODS_SOLD },
      { code: "5100", name: "Cost of Goods Sold", type: AccountType.EXPENSE, subType: AccountSubType.COST_OF_GOODS_SOLD },
      { code: "6000", name: "Rent Expense", type: AccountType.EXPENSE, subType: AccountSubType.OPERATING_EXPENSE },
      { code: "6010", name: "Utilities", type: AccountType.EXPENSE, subType: AccountSubType.OPERATING_EXPENSE },
      { code: "6020", name: "Salaries & Wages", type: AccountType.EXPENSE, subType: AccountSubType.PAYROLL_EXPENSE },
      { code: "6030", name: "Office Supplies", type: AccountType.EXPENSE, subType: AccountSubType.OPERATING_EXPENSE },
      { code: "6900", name: "Miscellaneous Expense", type: AccountType.EXPENSE, subType: AccountSubType.OTHER_EXPENSE },
    ];

    await this.prisma.chartAccount.createMany({
      data: defaults.map((d) => ({ ...d, isSystem: true })),
    });

    return { seeded: true, count: defaults.length };
  }
}
