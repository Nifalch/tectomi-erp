import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SocialPostStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateSocialPostDto,
  ListSocialPostsQueryDto,
  UpdateSocialPostDto,
} from "./dto/social-post.dto";

const POST_INCLUDE = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  marketingIdea: { select: { id: true, title: true, stage: true } },
} satisfies Prisma.SocialPostInclude;

@Injectable()
export class SocialPostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSocialPostsQueryDto) {
    const where: Prisma.SocialPostWhereInput = {
      AND: [
        query.platform ? { platform: query.platform } : {},
        query.status ? { status: query.status } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.marketingIdeaId ? { marketingIdeaId: query.marketingIdeaId } : {},
        query.from || query.to
          ? {
              scheduledAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {},
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { content: { contains: query.search, mode: "insensitive" } },
                { notes: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    return this.prisma.socialPost.findMany({
      where,
      orderBy: [
        // Posts without a schedule float to the bottom; otherwise ascending
        // by scheduled date so the calendar reads naturally.
        { scheduledAt: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      include: POST_INCLUDE,
    });
  }

  async get(id: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) throw new NotFoundException("Social post not found");
    return post;
  }

  create(userId: string, dto: CreateSocialPostDto) {
    // If a schedule is set, default the status to SCHEDULED so the planner
    // calendar picks it up immediately (callers can still override).
    const status = dto.status ?? (dto.scheduledAt ? SocialPostStatus.SCHEDULED : SocialPostStatus.DRAFT);
    return this.prisma.socialPost.create({
      data: {
        title: dto.title,
        content: dto.content,
        platform: dto.platform,
        status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        mediaUrls: dto.mediaUrls ?? [],
        link: dto.link,
        marketingIdeaId: dto.marketingIdeaId,
        notes: dto.notes,
        ownerId: userId,
      },
      include: POST_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateSocialPostDto) {
    const data: Prisma.SocialPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.publishedAt !== undefined) data.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    if (dto.mediaUrls !== undefined) data.mediaUrls = dto.mediaUrls;
    if (dto.link !== undefined) data.link = dto.link;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.marketingIdeaId !== undefined) {
      data.marketingIdea = dto.marketingIdeaId
        ? { connect: { id: dto.marketingIdeaId } }
        : { disconnect: true };
    }
    return this.prisma.socialPost.update({
      where: { id },
      data,
      include: POST_INCLUDE,
    });
  }

  /** Mark a scheduled post as published — convenience verb used after the
   *  team actually posts it. Preserves an existing `publishedAt` if set so
   *  a double-click or re-publish (link correction) doesn't overwrite the
   *  original timestamp and corrupt campaign analytics. */
  async markPublished(id: string, link?: string) {
    const existing = await this.prisma.socialPost.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    return this.prisma.socialPost.update({
      where: { id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        publishedAt: existing?.publishedAt ?? new Date(),
        ...(link ? { link } : {}),
      },
      include: POST_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.prisma.socialPost.delete({ where: { id } });
    return { success: true };
  }
}
