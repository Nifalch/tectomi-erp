import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ChannelType, NotificationType, RoleCode } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    // Seed a default GLOBAL "general" channel on first boot.
    try {
      const existing = await this.prisma.channel.findFirst({ where: { type: ChannelType.GLOBAL } });
      if (!existing) {
        const activeUsers = await this.prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true },
        });
        await this.prisma.channel.create({
          data: {
            type: ChannelType.GLOBAL,
            name: "general",
            description: "Company-wide chat",
            members: {
              create: activeUsers.map((u) => ({ userId: u.id })),
            },
          },
        });
        this.logger.log(`Seeded default GLOBAL channel "general" with ${activeUsers.length} members`);
      }
    } catch (e) {
      this.logger.warn(`Could not seed default channel: ${(e as Error).message}`);
    }
  }

  private async assertMember(channelId: string, userId: string) {
    const m = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!m) throw new ForbiddenException("You are not a member of this channel.");
    return m;
  }

  private directKeyFor(a: string, b: string) {
    return [a, b].sort().join("_");
  }

  private async getRoles(userId: string): Promise<RoleCode[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { code: true } } },
    });
    return rows.map((r) => r.role.code as RoleCode);
  }

  async listChannels(userId: string) {
    // Self-heal: legacy projects without a channel or missing this user as member.
    try {
      const projects = await this.prisma.project.findMany({
        where: {
          OR: [
            { managerId: userId },
            { members: { some: { userId } } },
          ],
        },
        select: { id: true },
      });
      for (const p of projects) {
        await this.ensureProjectChannel(p.id);
      }
    } catch (e) {
      this.logger.warn(`Project channel backfill failed: ${(e as Error).message}`);
    }

    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            project: { select: { id: true, name: true } },
            members: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, avatarUrl: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, content: true, authorId: true, createdAt: true, deletedAt: true },
            },
          },
        },
      },
    });

    const rows = await Promise.all(
      memberships.map(async (m) => {
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            channelId: m.channelId,
            createdAt: { gt: m.lastReadAt },
            authorId: { not: userId },
            deletedAt: null,
          },
        });
        const last = m.channel.messages[0];

        let name = m.channel.name;
        let directWith:
          | { id: string; firstName: string; lastName: string; avatarUrl: string | null }
          | undefined;

        if (m.channel.type === ChannelType.DIRECT) {
          const other = m.channel.members.find((x) => x.userId !== userId)?.user;
          if (other) {
            name = `${other.firstName ?? ""} ${other.lastName ?? ""}`.trim() || "Direct message";
            directWith = {
              id: other.id,
              firstName: other.firstName,
              lastName: other.lastName,
              avatarUrl: other.avatarUrl,
            };
          }
        }

        return {
          id: m.channel.id,
          type: m.channel.type,
          name,
          description: m.channel.description,
          projectId: m.channel.projectId,
          project: m.channel.project,
          updatedAt: m.channel.updatedAt,
          lastMessage: last
            ? {
                id: last.id,
                content: last.deletedAt ? "" : last.content,
                authorId: last.authorId,
                createdAt: last.createdAt,
                deleted: !!last.deletedAt,
              }
            : null,
          unreadCount,
          directWith,
        };
      }),
    );

    // Sort: GLOBAL → DIRECT (recent activity) → GROUP (alpha) → PROJECT (by project name, channel name)
    const orderOf = (t: ChannelType) =>
      t === ChannelType.GLOBAL ? 0 : t === ChannelType.DIRECT ? 1 : t === ChannelType.GROUP ? 2 : 3;

    rows.sort((a, b) => {
      const oa = orderOf(a.type as ChannelType);
      const ob = orderOf(b.type as ChannelType);
      if (oa !== ob) return oa - ob;

      if (a.type === ChannelType.DIRECT) {
        // Most recent activity first
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
        return tb - ta;
      }
      if (a.type === ChannelType.PROJECT) {
        const pa = a.project?.name ?? "";
        const pb = b.project?.name ?? "";
        const cmp = pa.localeCompare(pb);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    return rows;
  }

  async getChannel(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        project: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
        },
      },
    });
    if (!channel) throw new NotFoundException("Channel not found.");

    // For DIRECT channels, expose the peer via `directWith` and override name
    // so the panel header shows the other user's name.
    if (channel.type === ChannelType.DIRECT) {
      const other = channel.members.find((m) => m.userId !== userId)?.user;
      if (other) {
        (channel as any).directWith = {
          id: other.id,
          firstName: other.firstName,
          lastName: other.lastName,
          avatarUrl: other.avatarUrl,
        };
        (channel as any).name = `${other.firstName ?? ""} ${other.lastName ?? ""}`.trim() || "Direct message";
      }
    }
    return channel;
  }

  async getMessages(
    channelId: string,
    userId: string,
    opts: { before?: string; limit?: number } = {},
  ) {
    await this.assertMember(channelId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    let beforeDate: Date | undefined;
    if (opts.before) {
      const anchor = await this.prisma.chatMessage.findUnique({
        where: { id: opts.before },
        select: { createdAt: true },
      });
      if (anchor) beforeDate = anchor.createdAt;
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        channelId,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    return messages.reverse().map((m) => {
      const grouped = new Map<string, { emoji: string; users: string[]; count: number }>();
      for (const r of m.reactions) {
        const g = grouped.get(r.emoji) ?? { emoji: r.emoji, users: [], count: 0 };
        g.users.push(r.userId);
        g.count++;
        grouped.set(r.emoji, g);
      }
      return {
        id: m.id,
        channelId: m.channelId,
        authorId: m.authorId,
        author: m.author,
        content: m.deletedAt ? "" : m.content,
        editedAt: m.editedAt,
        deletedAt: m.deletedAt,
        createdAt: m.createdAt,
        reactions: [...grouped.values()],
      };
    });
  }

  async sendMessage(channelId: string, userId: string, content: string) {
    await this.assertMember(channelId, userId);
    const trimmed = (content ?? "").trim();
    if (!trimmed) throw new BadRequestException("Message cannot be empty.");
    const msg = await this.prisma.chatMessage.create({
      data: { channelId, authorId: userId, content: trimmed },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    await this.prisma.channel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });

    // Fire CHAT_MENTIONED to any @-mentioned channel members (best-effort).
    try {
      await this.notifyMentions(channelId, userId, trimmed, msg.author);
    } catch (e) {
      this.logger.warn(`Mention notify failed: ${(e as Error).message}`);
    }

    return msg;
  }

  /**
   * Parse `@firstname` / `@firstname.lastname` tokens out of the message and
   * fire a CHAT_MENTIONED notification to each matching channel member
   * (except the author). Individual failures are swallowed.
   */
  private async notifyMentions(
    channelId: string,
    authorId: string,
    content: string,
    author: { firstName: string | null; lastName: string | null } | null,
  ) {
    const matches = [...content.matchAll(/@([a-zA-Z][a-zA-Z0-9._-]+)/g)].map((m) => m[1]);
    if (!matches.length) return;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        project: { select: { name: true } },
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!channel) return;

    // Derive a display channel name (DIRECT uses the peer's name).
    let channelName = channel.name || "chat";
    if (channel.type === ChannelType.DIRECT) {
      const other = channel.members.find((m) => m.userId !== authorId)?.user;
      if (other) {
        channelName = `${other.firstName ?? ""} ${other.lastName ?? ""}`.trim() || "Direct message";
      }
    } else if (channel.type === ChannelType.PROJECT && channel.project?.name) {
      channelName = `${channel.project.name} / ${channel.name}`;
    }

    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
    const matchedUserIds = new Set<string>();
    for (const token of matches) {
      const t = token.toLowerCase();
      for (const m of channel.members) {
        if (m.userId === authorId) continue;
        const first = norm(m.user.firstName);
        const last = norm(m.user.lastName);
        const full = last ? `${first}.${last}` : first;
        if (t === full || t === first) {
          matchedUserIds.add(m.userId);
        }
      }
    }
    if (!matchedUserIds.size) return;

    const authorName = author
      ? `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "Someone"
      : "Someone";
    const body = content.slice(0, 140);
    const link = `/chat?c=${channelId}`;

    await Promise.all(
      [...matchedUserIds].map(async (uid) => {
        try {
          await this.notifications.create(uid, {
            type: NotificationType.CHAT_MENTIONED,
            title: `${authorName} mentioned you in ${channelName}`,
            body,
            link,
          });
        } catch {
          /* non-fatal */
        }
      }),
    );
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Message not found.");
    if (msg.deletedAt) throw new BadRequestException("Cannot edit a deleted message.");
    if (msg.authorId !== userId) throw new ForbiddenException("Only the author can edit this message.");
    const trimmed = (content ?? "").trim();
    if (!trimmed) throw new BadRequestException("Message cannot be empty.");
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
    });
  }

  async deleteMessage(messageId: string, userId: string, roles: RoleCode[] = []) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Message not found.");
    const isAdmin = roles.includes(RoleCode.SUPER_ADMIN) || roles.includes(RoleCode.ADMIN);
    if (msg.authorId !== userId && !isAdmin) {
      throw new ForbiddenException("You cannot delete this message.");
    }
    if (msg.deletedAt) return { success: true, alreadyDeleted: true };
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async markRead(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, deletedAt: true },
    });
    if (!msg) throw new NotFoundException("Message not found.");
    if (msg.deletedAt) throw new BadRequestException("Cannot react to a deleted message.");
    await this.assertMember(msg.channelId, userId);
    const clean = (emoji ?? "").trim();
    if (!clean) throw new BadRequestException("Emoji required.");
    await this.prisma.chatReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji: clean } },
      update: {},
      create: { messageId, userId, emoji: clean },
    });
    return { success: true };
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!msg) throw new NotFoundException("Message not found.");
    await this.assertMember(msg.channelId, userId);
    await this.prisma.chatReaction.deleteMany({ where: { messageId, userId, emoji } });
    return { success: true };
  }

  async createGlobalChannel(name: string, description: string | undefined, actorId: string) {
    const clean = (name ?? "").trim();
    if (!clean) throw new BadRequestException("Channel name required.");
    const activeUsers = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    return this.prisma.channel.create({
      data: {
        type: ChannelType.GLOBAL,
        name: clean,
        description,
        createdById: actorId,
        members: {
          create: activeUsers.map((u) => ({ userId: u.id })),
        },
      },
    });
  }

  async ensureDirectChannel(actorId: string, otherUserId: string) {
    if (!otherUserId || otherUserId === actorId) {
      throw new BadRequestException("Invalid direct message target.");
    }
    const key = this.directKeyFor(actorId, otherUserId);
    const existing = await this.prisma.channel.findUnique({
      where: { directKey: key },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
        },
      },
    });
    if (existing) return existing;

    // Validate both users exist and neither is CLIENT-only
    const users = await this.prisma.user.findMany({
      where: { id: { in: [actorId, otherUserId] } },
      select: { id: true },
    });
    if (users.length !== 2) {
      throw new NotFoundException("User not found.");
    }
    const otherRoles = await this.getRoles(otherUserId);
    if (otherRoles.length && otherRoles.every((r) => r === RoleCode.CLIENT)) {
      throw new ForbiddenException("Cannot direct-message a client user.");
    }
    const actorRoles = await this.getRoles(actorId);
    if (actorRoles.length && actorRoles.every((r) => r === RoleCode.CLIENT)) {
      throw new ForbiddenException("Clients cannot initiate direct messages.");
    }

    return this.prisma.channel.create({
      data: {
        type: ChannelType.DIRECT,
        name: "",
        isPrivate: true,
        directKey: key,
        createdById: actorId,
        members: {
          create: [{ userId: actorId }, { userId: otherUserId }],
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
        },
      },
    });
  }

  async createGroupChannel(
    actorId: string,
    data: { name: string; memberIds: string[]; description?: string },
  ) {
    const name = (data.name ?? "").trim();
    if (!name) throw new BadRequestException("Group name required.");
    const ids = Array.from(new Set((data.memberIds ?? []).filter((id) => id && id !== actorId)));
    if (ids.length < 2) {
      throw new BadRequestException("A group needs at least 2 other members.");
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (users.length !== ids.length) {
      throw new NotFoundException("One or more users not found.");
    }
    // Reject CLIENT-only users
    for (const id of ids) {
      const roles = await this.getRoles(id);
      if (roles.length && roles.every((r) => r === RoleCode.CLIENT)) {
        throw new ForbiddenException("Groups cannot include client users.");
      }
    }

    const memberIds = Array.from(new Set([actorId, ...ids]));
    return this.prisma.channel.create({
      data: {
        type: ChannelType.GROUP,
        name,
        description: data.description,
        isPrivate: true,
        createdById: actorId,
        members: {
          create: memberIds.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
        },
      },
    });
  }

  async createProjectChannel(
    actorId: string,
    projectId: string,
    data: { name: string; description?: string },
  ) {
    const name = (data.name ?? "").trim();
    if (!name) throw new BadRequestException("Channel name required.");

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException("Project not found.");

    // Access: super/admin, project manager, or project member
    const roles = await this.getRoles(actorId);
    const isAdmin = roles.includes(RoleCode.SUPER_ADMIN) || roles.includes(RoleCode.ADMIN);
    const isManager = project.managerId === actorId;
    const isMember = project.members.some((m) => m.userId === actorId);
    if (!isAdmin && !isManager && !isMember) {
      throw new ForbiddenException("You don't have access to this project.");
    }

    const duplicate = await this.prisma.channel.findFirst({
      where: { projectId, type: ChannelType.PROJECT, name },
    });
    if (duplicate) {
      throw new BadRequestException(`A channel named "${name}" already exists in this project.`);
    }

    const memberIds = new Set<string>();
    memberIds.add(project.managerId);
    for (const m of project.members) memberIds.add(m.userId);

    return this.prisma.channel.create({
      data: {
        type: ChannelType.PROJECT,
        name,
        description: data.description,
        projectId,
        isPrivate: false,
        createdById: actorId,
        members: {
          create: [...memberIds].map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
        },
      },
    });
  }

  async ensureProjectChannel(projectId: string) {
    // Only create the default channel if no PROJECT channel exists for this project yet.
    const existing = await this.prisma.channel.findFirst({
      where: { projectId, type: ChannelType.PROJECT },
    });
    if (existing) {
      await this.syncProjectChannelMembers(projectId);
      return existing;
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) return null;

    const memberIds = new Set<string>();
    memberIds.add(project.managerId);
    for (const m of project.members) memberIds.add(m.userId);

    return this.prisma.channel.create({
      data: {
        type: ChannelType.PROJECT,
        name: project.name,
        projectId: project.id,
        isPrivate: false,
        createdById: project.managerId,
        members: {
          create: [...memberIds].map((userId) => ({ userId })),
        },
      },
    });
  }

  /**
   * Sync channel members on ALL PROJECT channels for the given project to
   * match the current project roster (manager + members).
   */
  async syncProjectChannelMembers(projectId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { projectId, type: ChannelType.PROJECT },
      include: { members: { select: { userId: true } } },
    });
    if (!channels.length) return;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) return;

    const desired = new Set<string>();
    desired.add(project.managerId);
    for (const m of project.members) desired.add(m.userId);

    for (const channel of channels) {
      const current = new Set(channel.members.map((m) => m.userId));
      const toAdd = [...desired].filter((u) => !current.has(u));
      const toRemove = [...current].filter((u) => !desired.has(u));

      if (toAdd.length) {
        await this.prisma.channelMember.createMany({
          data: toAdd.map((userId) => ({ channelId: channel.id, userId })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length) {
        await this.prisma.channelMember.deleteMany({
          where: { channelId: channel.id, userId: { in: toRemove } },
        });
      }
    }
  }

  async listMembers(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });
    return rows.map((r) => ({
      userId: r.userId,
      lastReadAt: r.lastReadAt,
      user: r.user,
    }));
  }
}
