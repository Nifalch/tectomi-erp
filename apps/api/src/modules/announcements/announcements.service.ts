import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from "./dto/announcement.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    const now = new Date();
    const announcements = await this.prisma.announcement.findMany({
      where: {
        OR: [{ pinnedUntil: null }, { pinnedUntil: { gt: now } }],
      },
      include: {
        publishedBy: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    // Pinned (pinnedUntil > now) first, others after
    return announcements.sort((a, b) => {
      const aPinned = a.pinnedUntil && a.pinnedUntil > now ? 1 : 0;
      const bPinned = b.pinnedUntil && b.pinnedUntil > now ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
  }

  async create(currentUserId: string, dto: CreateAnnouncementDto) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        priority: dto.priority,
        pinnedUntil: dto.pinnedUntil ? new Date(dto.pinnedUntil) : null,
        publishedById: currentUserId,
        publishedAt: new Date(),
      },
    });

    // Fan out ANNOUNCEMENT_POSTED to all active users except the creator.
    try {
      const audience = await this.prisma.user.findMany({
        where: { status: "ACTIVE", id: { not: currentUserId } },
        select: { id: true },
      });
      const excerpt = (dto.content ?? "").slice(0, 140);
      await Promise.all(
        audience.map(async (u) => {
          try {
            await this.notifications.create(u.id, {
              type: NotificationType.ANNOUNCEMENT_POSTED,
              title: `New announcement: ${dto.title}`,
              body: excerpt,
              link: "/announcements",
            });
          } catch {
            /* non-fatal */
          }
        }),
      );
    } catch {
      /* non-fatal */
    }

    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const data: Prisma.AnnouncementUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.pinnedUntil !== undefined) {
      data.pinnedUntil = dto.pinnedUntil ? new Date(dto.pinnedUntil) : null;
    }
    return this.prisma.announcement.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }
}
