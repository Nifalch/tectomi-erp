import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { nextNumber } from "../_shared/auto-number.util";
import { CreateJournalEntryDto, JournalLineDto, UpdateJournalEntryDto } from "./dto/journal-entry.dto";

@Injectable()
export class JournalEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  private baseInclude = { lines: { include: { account: true } }, createdBy: true };

  private validateLines(lines: JournalLineDto[]) {
    const debits = lines.reduce((s, l) => s + l.debit, 0);
    const credits = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(debits - credits) > 0.001) {
      throw new BadRequestException(`Journal debits (${debits}) must equal credits (${credits}).`);
    }
  }

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        include: this.baseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.journalEntry.count(),
    ]);
    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const j = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: this.baseInclude,
    });
    if (!j) throw new NotFoundException("Journal entry not found.");
    return j;
  }

  async create(createdById: string, dto: CreateJournalEntryDto) {
    this.validateLines(dto.lines);
    const journalNumber = await nextNumber(this.prisma, "journalEntry", "JRN-");
    return this.prisma.journalEntry.create({
      data: {
        journalNumber,
        date: new Date(dto.date),
        description: dto.description,
        reference: dto.reference,
        createdById,
        lines: {
          create: dto.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
      include: this.baseInclude,
    });
  }

  async update(id: string, dto: UpdateJournalEntryDto) {
    const updates: any = {
      date: dto.date ? new Date(dto.date) : undefined,
      description: dto.description,
      reference: dto.reference,
    };
    if (dto.lines) {
      this.validateLines(dto.lines);
      await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
      updates.lines = {
        create: dto.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      };
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: updates,
      include: this.baseInclude,
    });
  }

  async remove(id: string) {
    await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
    await this.prisma.journalEntry.delete({ where: { id } });
    return { success: true };
  }
}
