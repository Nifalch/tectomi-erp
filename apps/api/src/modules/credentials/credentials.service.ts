import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CredentialAccessRole,
  CredentialAuditAction,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CredentialCryptoService } from "./credentials.crypto";
import {
  CreateCredentialDto,
  CreateFolderDto,
  ListCredentialsQueryDto,
  ShareCredentialDto,
  UpdateCredentialDto,
  UpdateFolderDto,
  UpdateShareRoleDto,
} from "./dto/credential.dto";

// Reusable Prisma select that strips the encrypted payload from list rows —
// the only place we ever return `ciphertext` is the explicit `reveal()` call,
// which also writes an audit row.
const CREDENTIAL_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  description: true,
  username: true,
  url: true,
  metadata: true,
  tags: true,
  expiresAt: true,
  lastRotatedAt: true,
  rotationIntervalDays: true,
  requiresReason: true,
  highSecurity: true,
  folderId: true,
  folder: { select: { id: true, name: true, color: true } },
  ownerId: true,
  owner: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  accesses: {
    select: {
      id: true,
      role: true,
      grantedAt: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CredentialSelect;

type RequestMeta = { ipAddress?: string; userAgent?: string };

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  // ── Folders ────────────────────────────────────────────────────────────────

  async listFolders(userId: string) {
    // Folders are not access-scoped per row — anyone can see the tree, but
    // credentials inside are still gated by ownership/access. This keeps the
    // UI's folder picker uncomplicated.
    void userId;
    return this.prisma.credentialFolder.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        parentId: true,
        createdAt: true,
        _count: { select: { credentials: true } },
      },
    });
  }

  async createFolder(userId: string, dto: CreateFolderDto) {
    return this.prisma.credentialFolder.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        parentId: dto.parentId,
        createdById: userId,
      },
    });
  }

  async updateFolder(id: string, dto: UpdateFolderDto) {
    return this.prisma.credentialFolder.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });
  }

  async deleteFolder(id: string) {
    // Credentials inside the folder are kept (folderId becomes null via the
    // schema's SetNull cascade) so we don't accidentally trash secrets when
    // a user deletes a folder for tidiness.
    await this.prisma.credentialFolder.delete({ where: { id } });
    return { success: true };
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  /**
   * Returns the credentials the caller can see: owned + explicitly shared.
   * The encrypted payload is NEVER returned here — only the public columns.
   */
  async list(userId: string, query: ListCredentialsQueryDto) {
    const ownership = query.ownedBy ?? "all";
    const accessFilter: Prisma.CredentialWhereInput =
      ownership === "me"
        ? { ownerId: userId }
        : ownership === "shared"
          ? { ownerId: { not: userId }, accesses: { some: { userId } } }
          : { OR: [{ ownerId: userId }, { accesses: { some: { userId } } }] };

    const where: Prisma.CredentialWhereInput = {
      AND: [
        accessFilter,
        query.type ? { type: query.type } : {},
        query.folderId ? { folderId: query.folderId } : {},
        query.tag ? { tags: { has: query.tag } } : {},
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { username: { contains: query.search, mode: "insensitive" } },
                { url: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    return this.prisma.credential.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      select: CREDENTIAL_LIST_SELECT,
    });
  }

  async getMetadata(userId: string, id: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id },
      select: CREDENTIAL_LIST_SELECT,
    });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanView(credential, userId);
    return credential;
  }

  /**
   * Decrypt + return the secret payload. Writes an audit row every time —
   * this is the only call site that ever exposes plaintext to a user.
   *
   * `reason` is required when the credential's `requiresReason` flag is on
   * (typical for SOCIAL_MEDIA / EMAIL_ACCOUNT). The reason is persisted on
   * the audit row so the trail explains WHY each reveal happened, not just
   * who/when.
   */
  async reveal(userId: string, id: string, reason: string | undefined, meta: RequestMeta = {}) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanView(credential, userId);

    if (credential.requiresReason) {
      const trimmed = (reason ?? "").trim();
      if (trimmed.length < 4) {
        throw new BadRequestException(
          "This credential requires a short reason on every reveal (min 4 characters).",
        );
      }
    }

    const secret = this.crypto.decryptJSON(credential.ciphertext);

    await this.audit(id, userId, CredentialAuditAction.REVEALED, meta, {
      reason: reason?.trim() || undefined,
    });

    return {
      id: credential.id,
      secret,
      revealedAt: new Date().toISOString(),
    };
  }

  async create(userId: string, dto: CreateCredentialDto, meta: RequestMeta = {}) {
    const ciphertext = this.crypto.encryptJSON(dto.secret);
    // Default-on the safety flags for the two account-takeover-prone types
    // even if the client forgot to set them. Callers can still opt-out by
    // explicitly passing `requiresReason: false`.
    const isSensitiveType = dto.type === "SOCIAL_MEDIA" || dto.type === "EMAIL_ACCOUNT";
    const requiresReason = dto.requiresReason ?? isSensitiveType;
    const highSecurity = dto.highSecurity ?? isSensitiveType;

    const credential = await this.prisma.credential.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        username: dto.username,
        url: dto.url,
        ciphertext,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        tags: dto.tags ?? [],
        requiresReason,
        highSecurity,
        folderId: dto.folderId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        rotationIntervalDays: dto.rotationIntervalDays,
        lastRotatedAt: new Date(),
        ownerId: userId,
      },
      select: CREDENTIAL_LIST_SELECT,
    });

    await this.audit(credential.id, userId, CredentialAuditAction.CREATED, meta);
    return credential;
  }

  async update(userId: string, id: string, dto: UpdateCredentialDto, meta: RequestMeta = {}) {
    const existing = await this.prisma.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Credential not found");
    await this.assertCanEdit(existing, userId);

    // Detect whether this update materially changes anything; folder-only
    // moves and ordinary edits become two separate audit rows.
    const rotated = dto.markRotated || dto.secret !== undefined;
    const renamed = dto.name !== undefined && dto.name !== existing.name;
    const folderChanged =
      dto.folderId !== undefined && dto.folderId !== existing.folderId;

    const data: Prisma.CredentialUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.secret !== undefined) data.ciphertext = this.crypto.encryptJSON(dto.secret);
    if (dto.metadata !== undefined) data.metadata = (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.requiresReason !== undefined) data.requiresReason = dto.requiresReason;
    if (dto.highSecurity !== undefined) data.highSecurity = dto.highSecurity;
    if (dto.folderId !== undefined) {
      data.folder = dto.folderId ? { connect: { id: dto.folderId } } : { disconnect: true };
    }
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.rotationIntervalDays !== undefined) data.rotationIntervalDays = dto.rotationIntervalDays;
    if (rotated) data.lastRotatedAt = new Date();

    const updated = await this.prisma.credential.update({
      where: { id },
      data,
      select: CREDENTIAL_LIST_SELECT,
    });

    // Write the audit trail. Multiple actions can fire on one update — that's
    // intentional, the timeline reads more honestly when a rename+rotate
    // shows as two rows.
    await this.audit(id, userId, CredentialAuditAction.UPDATED, meta);
    if (rotated) await this.audit(id, userId, CredentialAuditAction.ROTATED, meta);
    if (renamed) await this.audit(id, userId, CredentialAuditAction.RENAMED, meta, { from: existing.name, to: dto.name });
    if (folderChanged) await this.audit(id, userId, CredentialAuditAction.FOLDER_MOVED, meta, { from: existing.folderId, to: dto.folderId });

    return updated;
  }

  async remove(userId: string, id: string, meta: RequestMeta = {}) {
    const existing = await this.prisma.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Credential not found");
    // Only the owner can delete — sharing as EDITOR still doesn't let you
    // nuke someone else's secret.
    if (existing.ownerId !== userId) {
      throw new ForbiddenException("Only the credential owner can delete it.");
    }
    // Write audit BEFORE delete — cascade would otherwise wipe the trail.
    await this.audit(id, userId, CredentialAuditAction.DELETED, meta);
    await this.prisma.credential.delete({ where: { id } });
    return { success: true };
  }

  async listAudit(userId: string, id: string) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanView(credential, userId);
    return this.prisma.credentialAudit.findMany({
      where: { credentialId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
  }

  // ── Sharing ────────────────────────────────────────────────────────────────

  async share(userId: string, id: string, dto: ShareCredentialDto, meta: RequestMeta = {}) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanEdit(credential, userId);
    if (dto.userId === credential.ownerId) {
      throw new ForbiddenException("Owner already has access; no need to share with themselves.");
    }
    if (dto.role === CredentialAccessRole.OWNER) {
      throw new ForbiddenException("Use the dedicated transfer-ownership flow to grant OWNER.");
    }

    const access = await this.prisma.credentialAccess.upsert({
      where: { credentialId_userId: { credentialId: id, userId: dto.userId } },
      create: {
        credentialId: id,
        userId: dto.userId,
        role: dto.role,
        grantedById: userId,
      },
      update: { role: dto.role, grantedById: userId, grantedAt: new Date() },
    });

    await this.audit(id, userId, CredentialAuditAction.SHARED, meta, { withUserId: dto.userId, role: dto.role });
    return access;
  }

  async updateShareRole(userId: string, id: string, accessId: string, dto: UpdateShareRoleDto, meta: RequestMeta = {}) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanEdit(credential, userId);
    if (dto.role === CredentialAccessRole.OWNER) {
      throw new ForbiddenException("Use the dedicated transfer-ownership flow to grant OWNER.");
    }
    const updated = await this.prisma.credentialAccess.update({
      where: { id: accessId },
      data: { role: dto.role },
    });
    await this.audit(id, userId, CredentialAuditAction.ROLE_CHANGED, meta, { accessId, role: dto.role });
    return updated;
  }

  async unshare(userId: string, id: string, accessId: string, meta: RequestMeta = {}) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.assertCanEdit(credential, userId);
    const access = await this.prisma.credentialAccess.findUnique({ where: { id: accessId } });
    if (!access || access.credentialId !== id) {
      throw new NotFoundException("Share record not found");
    }
    await this.prisma.credentialAccess.delete({ where: { id: accessId } });
    await this.audit(id, userId, CredentialAuditAction.UNSHARED, meta, { accessId, removedUserId: access.userId });
    return { success: true };
  }

  /**
   * Lightweight directory used by the share dialog — active users only.
   * Returns name + email so the picker can search without needing the full
   * users module.
   */
  async listShareableUsers(currentUserId: string, search?: string) {
    return this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        id: { not: currentUserId },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { firstName: "asc" },
      take: 25,
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertCanView(
    credential: { ownerId: string; id: string },
    userId: string,
  ) {
    if (credential.ownerId === userId) return;
    const access = await this.prisma.credentialAccess.findUnique({
      where: { credentialId_userId: { credentialId: credential.id, userId } },
    });
    if (!access) {
      throw new ForbiddenException("You do not have access to this credential.");
    }
  }

  private async assertCanEdit(
    credential: { ownerId: string; id: string },
    userId: string,
  ) {
    if (credential.ownerId === userId) return;
    const access = await this.prisma.credentialAccess.findUnique({
      where: { credentialId_userId: { credentialId: credential.id, userId } },
    });
    if (!access || (access.role !== CredentialAccessRole.EDITOR && access.role !== CredentialAccessRole.OWNER)) {
      throw new ForbiddenException("You need editor access to modify this credential.");
    }
  }

  private async audit(
    credentialId: string,
    userId: string,
    action: CredentialAuditAction,
    meta: RequestMeta,
    extra?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.credentialAudit.create({
        data: {
          credentialId,
          userId,
          action,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: (extra as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
    } catch {
      // Audit is best-effort — don't fail the user-facing action if the log
      // insert blows up. We'd rather a working reveal + missing audit row
      // than a working audit + failed reveal.
    }
  }
}
