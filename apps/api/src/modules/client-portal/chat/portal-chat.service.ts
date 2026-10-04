import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * Per-project chat between the client and team. Reuses the
 * ProjectClientMessage table — the staff side reads/writes the same
 * rows from the dashboard. Keeps the auth surface narrow: a contact
 * can only see/write messages on projects belonging to their own
 * client.
 */
@Injectable()
export class PortalChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwnership(clientId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");
  }

  async list(clientId: string, projectId: string, opts: { before?: string; limit?: number } = {}) {
    await this.assertOwnership(clientId, projectId);
    // Cursor-based pagination — when the chat exceeds `take`, callers can
    // pass `before=<oldest-loaded-message-id>` to fetch the previous page.
    // Without this, busy projects silently truncated at 200 messages with
    // no way to load older history.
    const take = Math.min(Math.max(1, opts.limit ?? 100), 200);
    let beforeCreatedAt: Date | undefined;
    if (opts.before) {
      const anchor = await this.prisma.projectClientMessage.findUnique({
        where: { id: opts.before },
        select: { createdAt: true },
      });
      if (anchor) beforeCreatedAt = anchor.createdAt;
    }
    const rows = await this.prisma.projectClientMessage.findMany({
      where: {
        projectId,
        ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { firstName: true, lastName: true, avatarUrl: true } },
        fromContact: { select: { name: true, email: true } },
      },
      take,
    });
    // Re-flip so the caller still gets ascending (oldest-first) order.
    return rows.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      side: m.fromUserId ? "team" : "client",
      authorName: m.fromUser
        ? `${m.fromUser.firstName ?? ""} ${m.fromUser.lastName ?? ""}`.trim() || "Team"
        : m.fromContact?.name || m.fromContact?.email || "Client",
      avatarUrl: m.fromUser?.avatarUrl ?? null,
    }));
  }

  async post(clientId: string, contactId: string, projectId: string, content: string) {
    await this.assertOwnership(clientId, projectId);
    const text = content?.trim();
    if (!text) throw new BadRequestException("Message body required");
    if (text.length > 5000) throw new BadRequestException("Too long");
    const msg = await this.prisma.projectClientMessage.create({
      data: { projectId, content: text, fromContactId: contactId },
    });
    return { id: msg.id, ok: true };
  }
}
