import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateArticleDto } from "./dto/create-article.dto";

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where = query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" as const } },
            { category: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.findMany({
        where,
        include: { author: true },
        skip,
        take,
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { author: true },
    });

    if (!article) {
      throw new NotFoundException("Article not found.");
    }

    return article;
  }

  async create(authorId: string, dto: CreateArticleDto) {
    return this.prisma.knowledgeArticle.create({
      data: {
        ...dto,
        author: { connect: { id: authorId } },
      },
    });
  }

  async update(id: string, dto: Partial<CreateArticleDto>) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article) {
      throw new NotFoundException("Article not found.");
    }
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.knowledgeArticle.delete({ where: { id } });
  }
}
