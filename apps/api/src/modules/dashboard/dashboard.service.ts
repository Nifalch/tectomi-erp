import { Injectable } from "@nestjs/common";
import { AccountType, InvoiceStatus, ProjectStatus, UserStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    // Revenue/Expenses now come from the live GL (JournalLine totals on
    // INCOME / EXPENSE accounts) instead of the legacy Revenue/Expense
    // tables, which the new auto-post pipeline never writes to. This way
    // the top-card metrics match the rest of the finance UI.
    const [projects, pendingInvoices, users, accounts, tasksByStatus] = await this.prisma.$transaction([
      this.prisma.project.count({ where: { status: ProjectStatus.ACTIVE } }),
      this.prisma.invoice.count({ where: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } } }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.chartAccount.findMany({
        where: { type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
        select: { id: true, type: true },
      }),
      this.prisma.task.groupBy({
        by: ["status"],
        orderBy: { status: "asc" },
        _count: true,
      }),
    ]);

    const incomeIds = accounts.filter((a) => a.type === AccountType.INCOME).map((a) => a.id);
    const expenseIds = accounts.filter((a) => a.type === AccountType.EXPENSE).map((a) => a.id);

    const [incomeAgg, expenseAgg] = await this.prisma.$transaction([
      // INCOME normal balance is CREDIT → revenue = sum(credit) - sum(debit)
      this.prisma.journalLine.aggregate({
        where: { accountId: { in: incomeIds.length ? incomeIds : ["__none__"] } },
        _sum: { credit: true, debit: true },
      }),
      // EXPENSE normal balance is DEBIT → expense = sum(debit) - sum(credit)
      this.prisma.journalLine.aggregate({
        where: { accountId: { in: expenseIds.length ? expenseIds : ["__none__"] } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const revenue = num(incomeAgg._sum.credit) - num(incomeAgg._sum.debit);
    const expenses = num(expenseAgg._sum.debit) - num(expenseAgg._sum.credit);

    return {
      metrics: {
        activeProjects: projects,
        pendingInvoices,
        activeEmployees: users,
        revenue,
        expenses,
      },
      taskBoard: tasksByStatus,
    };
  }
}

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}
