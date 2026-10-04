import { Injectable } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateDocumentDto } from "./dto/create-document.dto";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(filters?: { clientId?: string; projectId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.projectId) where.projectId = filters.projectId;

    return this.prisma.document.findMany({
      where,
      include: {
        uploadedBy: true,
        project: true,
        client: true,
      },
      orderBy: { createdAt: "desc" },
      take: filters?.clientId || filters?.projectId ? 200 : 50,
    });
  }

  async create(uploadedById: string, dto: CreateDocumentDto) {
    const doc = await this.prisma.document.create({
      data: {
        fileName: dto.fileName,
        fileUrl: dto.fileUrl || this.storageService.getPublicUrl(dto.fileName),
        entityType: dto.entityType,
        projectId: dto.projectId,
        clientId: dto.clientId,
        uploadedById,
      },
    });

    // Notify project members + manager when a new document lands on a
    // project, so contributors don't miss specs / designs / refs the
    // team just dropped in. Best-effort: don't break uploads on notify
    // failures.
    if (dto.projectId) {
      try {
        const project = await this.prisma.project.findUnique({
          where: { id: dto.projectId },
          select: {
            name: true,
            managerId: true,
            members: { select: { userId: true } },
          },
        });
        if (project) {
          const recipients = new Set<string>(project.members.map((m) => m.userId));
          if (project.managerId) recipients.add(project.managerId);
          recipients.delete(uploadedById);
          await Promise.all(
            Array.from(recipients).map((uid) =>
              this.notifications.create(uid, {
                type: NotificationType.GENERIC,
                title: `New file on ${project.name}`,
                body: `"${dto.fileName}" was uploaded to the project.`,
                link: `/projects/${dto.projectId}`,
                projectId: dto.projectId,
              }).catch(() => undefined),
            ),
          );
        }
      } catch {
        /* non-fatal */
      }
    }

    return doc;
  }

  async remove(id: string) {
    return this.prisma.document.delete({
      where: { id },
    });
  }
}
