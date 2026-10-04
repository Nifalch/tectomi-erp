import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BankTxnType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateBankAccountDto, CreateBankTransactionDto, UpdateBankAccountDto } from "./dto/bank-account.dto";

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.bankAccount.findMany({
      include: { account: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const acc = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!acc) throw new NotFoundException("Bank account not found.");
    return acc;
  }

  create(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({
      data: {
        ...dto,
        currentBalance: dto.openingBalance,
      },
    });
  }

  update(id: string, dto: UpdateBankAccountDto) {
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }

  async remove(id: string, options: { force?: boolean } = {}) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { payments: true, transactions: true } } },
    });
    if (!account) throw new NotFoundException("Bank account not found.");

    if (!options.force) {
      if (account._count.payments > 0) {
        throw new ConflictException(
          `Cannot delete: ${account._count.payments} payment(s) reference this account. Re-assign or delete them first, or use force delete.`,
        );
      }
      if (account._count.transactions > 0) {
        throw new ConflictException(
          `Cannot delete: ${account._count.transactions} transaction(s) on this account. Delete them first, or use force delete.`,
        );
      }
    }

    await this.prisma.bankAccount.delete({ where: { id } });
    return { success: true };
  }

  async listTransactions(id: string, query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);

    // Fetch the account so we can derive the opening balance for the running total
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: { openingBalance: true },
    });
    if (!account) throw new NotFoundException("Bank account not found.");

    // Pull ALL transactions ascending so we can compute a running balance,
    // then slice the requested page out of the resulting array (descending).
    const [allAsc, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where: { bankAccountId: id },
        include: { category: true, payment: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.bankTransaction.count({ where: { bankAccountId: id } }),
    ]);

    let running = Number(account.openingBalance);
    const annotated = allAsc.map((t) => {
      const amt = Number(t.amount);
      running += t.type === "CREDIT" ? amt : -amt;
      // round to 2 decimals to avoid floating-point drift across many transactions
      running = Math.round(running * 100) / 100;
      const reconciled = t.reconciledAt != null;
      return { ...t, runningBalance: running, reconciled };
    });

    // Display order is descending (newest first), then paginate
    const desc = annotated.reverse();
    const data = desc.slice(skip, skip + take);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async createTransaction(id: string, dto: CreateBankTransactionDto) {
    const bank = await this.findOne(id);
    const txn = await this.prisma.bankTransaction.create({
      data: {
        bankAccountId: id,
        date: new Date(dto.date),
        amount: dto.amount,
        type: dto.type,
        description: dto.description,
        reference: dto.reference,
        categoryId: dto.categoryId,
      },
    });
    const delta = dto.type === BankTxnType.CREDIT ? dto.amount : -dto.amount;
    await this.prisma.bankAccount.update({
      where: { id },
      data: { currentBalance: Number(bank.currentBalance) + delta },
    });
    return txn;
  }

  async reconcile(_id: string, txnId: string) {
    return this.prisma.bankTransaction.update({
      where: { id: txnId },
      data: { reconciledAt: new Date() },
    });
  }
}
