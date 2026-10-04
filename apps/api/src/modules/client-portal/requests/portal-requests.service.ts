import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ClientRequestStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { serializeRequest, serializeRequestMessage } from "../serializers";
import type { CreateRequestDto, ReplyDto } from "./dto";

@Injectable()
export class PortalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(clientId: string, status?: string) {
    // Validate `status` against the actual enum rather than blindly casting
    // through `as any` — a stray value used to bubble up as a Prisma 500
    // that leaked column names. Unknown values are simply ignored.
    const statusFilter =
      status && (Object.values(ClientRequestStatus) as string[]).includes(status)
        ? { status: status as ClientRequestStatus }
        : {};
    const rows = await this.prisma.clientRequest.findMany({
      where: { clientId, ...statusFilter },
      orderBy: { updatedAt: "desc" },
      // Last message preview powers the WhatsApp-style row in the
      // floating chat widget. Single take=1 per row is cheap and avoids
      // a second round-trip on the client.
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            authorContact: { select: { id: true, name: true } },
            authorUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((r) => {
      const last = r.messages[0];
      return {
        ...serializeRequest(r),
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              author: {
                kind: last.authorUserId ? ("staff" as const) : ("client" as const),
                name: last.authorUser
                  ? `${last.authorUser.firstName} ${last.authorUser.lastName}`.trim()
                  : last.authorContact?.name ?? null,
              },
            }
          : null,
      };
    });
  }

  async detail(clientId: string, id: string) {
    const r = await this.prisma.clientRequest.findFirst({
      where: { id, clientId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            authorContact: { select: { id: true, name: true } },
            authorUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!r) throw new NotFoundException();
    return {
      ...serializeRequest(r),
      body: r.body,
      messages: r.messages.map(serializeRequestMessage),
    };
  }

  async create(clientId: string, contactId: string, dto: CreateRequestDto) {
    if (dto.projectId) {
      const owns = await this.prisma.project.findFirst({
        where: { id: dto.projectId, clientId },
        select: { id: true },
      });
      if (!owns) throw new BadRequestException("invalid_project");
    }
    const created = await this.prisma.clientRequest.create({
      data: {
        clientId,
        createdById: contactId,
        title: dto.title,
        body: dto.body,
        projectId: dto.projectId ?? null,
      },
    });

    const recipients = await this.findRecipients(clientId, dto.projectId ?? null);
    await Promise.all(
      recipients.map((userId) =>
        this.notifications.create(userId, {
          type: "GENERIC",
          title: `New client request: ${created.title}`,
          body: dto.body.slice(0, 200),
          link: `/clients/${clientId}/requests/${created.id}`,
          projectId: dto.projectId ?? undefined,
        }).catch(() => undefined),
      ),
    );

    return serializeRequest(created);
  }

  async reply(clientId: string, contactId: string, requestId: string, dto: ReplyDto) {
    const r = await this.prisma.clientRequest.findFirst({ where: { id: requestId, clientId } });
    if (!r) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.clientRequestMessage.create({
        data: { requestId, authorContactId: contactId, body: dto.body },
      }),
      this.prisma.clientRequest.update({
        where: { id: requestId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const recipients = await this.findRecipients(clientId, r.projectId);
    await Promise.all(
      recipients.map((userId) =>
        this.notifications.create(userId, {
          type: "GENERIC",
          title: `Client replied: ${r.title}`,
          body: dto.body.slice(0, 200),
          link: `/clients/${clientId}/requests/${requestId}`,
          projectId: r.projectId ?? undefined,
        }).catch(() => undefined),
      ),
    );

    return { ok: true };
  }

  private async findRecipients(clientId: string, projectId: string | null): Promise<string[]> {
    if (projectId) {
      const pm = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { managerId: true },
      });
      if (pm?.managerId) return [pm.managerId];
    }
    const admins = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    return admins.map((u) => u.id);
  }
}
