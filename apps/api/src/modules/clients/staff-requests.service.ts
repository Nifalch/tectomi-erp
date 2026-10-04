import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { env } from "../../config/env";

@Injectable()
export class StaffRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  list(clientId: string) {
    return this.prisma.clientRequest.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async detail(id: string) {
    const r = await this.prisma.clientRequest.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
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
    return r;
  }

  async reply(id: string, userId: string, body: string) {
    const r = await this.prisma.clientRequest.findUnique({
      where: { id },
      include: { createdBy: { select: { email: true, name: true } } },
    });
    if (!r) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.clientRequestMessage.create({
        data: { requestId: id, authorUserId: userId, body },
      }),
      this.prisma.clientRequest.update({
        where: { id },
        data: { updatedAt: new Date(), status: r.status === "OPEN" ? "IN_PROGRESS" : r.status },
      }),
    ]);

    // Email the originating contact. Best-effort; never blocks the reply.
    if (r.createdBy?.email) {
      this.mail
        .sendTemplateEmail(r.createdBy.email, `Update on your request: ${r.title}`, {
          name: r.createdBy.name ?? "there",
          title: r.title,
          link: `${env.portalUrl}/portal/requests/${id}`,
        })
        .catch(() => undefined);
    }

    return { ok: true };
  }

  async setStatus(
    id: string,
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  ) {
    const r = await this.prisma.clientRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    return this.prisma.clientRequest.update({ where: { id }, data: { status } });
  }

  async linkTask(id: string, taskId: string) {
    const r = await this.prisma.clientRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    const t = await this.prisma.task.findFirst({
      where: { id: taskId, project: { clientId: r.clientId } },
    });
    if (!t) throw new ForbiddenException("task_not_in_client");
    return this.prisma.clientRequest.update({
      where: { id },
      data: { linkedTaskId: taskId },
    });
  }
}
