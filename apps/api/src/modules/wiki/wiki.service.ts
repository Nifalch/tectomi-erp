import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

interface CreateWikiInput {
  projectId: string;
  title: string;
  content: string;
  parentId?: string;
}

interface UpdateWikiInput {
  title?: string;
  content?: string;
  parentId?: string;
  sortOrder?: number;
}

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string) {
    return this.prisma.projectWikiPage.findMany({
      where: { projectId },
      include: {
        author: true,
        children: true,
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findOne(id: string) {
    const page = await this.prisma.projectWikiPage.findUnique({
      where: { id },
      include: { author: true },
    });
    if (!page) {
      throw new NotFoundException("Wiki page not found.");
    }
    return page;
  }

  async create(dto: CreateWikiInput, authorId: string) {
    return this.prisma.projectWikiPage.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        content: dto.content,
        parentId: dto.parentId,
        authorId,
      },
      include: { author: true },
    });
  }

  async update(id: string, dto: UpdateWikiInput) {
    const page = await this.prisma.projectWikiPage.findUnique({ where: { id } });
    if (!page) {
      throw new NotFoundException("Wiki page not found.");
    }
    return this.prisma.projectWikiPage.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
      },
      include: { author: true },
    });
  }

  async remove(id: string) {
    return this.prisma.projectWikiPage.delete({ where: { id } });
  }
}
