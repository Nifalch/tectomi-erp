import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityAction, Prisma, RoleCode, UserStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateClientDto } from "./dto/create-client.dto";
import { hashPassword } from "../auth/password.util";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Write an audit-log entry for a client action. Fails silently. */
  private async logActivity(userId: string, action: ActivityAction, client: { id: string; companyName: string }, details?: string) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          entityType: "client",
          entityId: client.id,
          entityName: client.companyName,
          details: details?.slice(0, 500),
        },
      });
    } catch {
      // Don't break the user flow if audit write fails.
    }
  }

  async findAll(query: PaginationDto & { includeArchived?: string }) {
    const { skip, take, page, pageSize } = getPagination(query);
    const includeArchived = query.includeArchived === "true" || query.includeArchived === "1";

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: "insensitive" as const } },
        { contactPerson: { contains: query.search, mode: "insensitive" as const } },
        { email: { contains: query.search, mode: "insensitive" as const } },
      ];
    }
    // Hide archived by default — senior CRM UX.
    if (!includeArchived) {
      where.status = { not: "ARCHIVED" };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: {
          projects: { select: { id: true } },
          invoices: { select: { id: true, total: true, status: true, paidAt: true } },
          contracts: { select: { id: true } },
          accountManager: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          // Most recent communication / activity → used for "last contact"
          activities: {
            select: { id: true, createdAt: true, completedAt: true, type: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.count({ where }),
    ]);

    // Attach computed lastContactAt to each row
    const enriched = data.map((c) => ({
      ...c,
      lastContactAt: c.activities[0]?.completedAt ?? c.activities[0]?.createdAt ?? null,
    }));

    return {
      data: enriched,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(dto: CreateClientDto, actorId?: string) {
    const clean = this.sanitize(dto);

    // Pre-check unique constraints so we can return friendly 400s instead of Prisma P2002 → 500.
    if (clean.email) {
      const clash = await this.prisma.client.findFirst({ where: { email: clean.email } });
      if (clash) {
        throw new BadRequestException(
          `A client with email "${clean.email}" already exists (${clash.companyName}).`,
        );
      }
    }

    try {
      const data: Prisma.ClientUncheckedCreateInput = {
        ...(clean as Prisma.ClientUncheckedCreateInput),
        companyName: dto.companyName,
        tags: dto.tags ?? [],
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : undefined,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
      };
      const created = await this.prisma.client.create({
        data,
        include: {
          accountManager: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      if (actorId) await this.logActivity(actorId, ActivityAction.CREATED, created);
      return created;
    } catch (err: any) {
      // Belt-and-braces: catch any remaining unique-constraint issue from a race.
      if (err?.code === "P2002") {
        throw new BadRequestException("A client with these details already exists.");
      }
      throw err;
    }
  }

  private sanitize<T extends object>(dto: T): T {
    const clean: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
    for (const k of Object.keys(clean)) {
      if (clean[k] === "") clean[k] = undefined;
    }
    return clean as T;
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        projects: { include: { manager: true } },
        invoices: { include: { items: true } },
        proposals: true,
        contracts: true,
        documents: {
          include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
        },
        contacts: true,
        deals: { include: { owner: { select: { id: true, firstName: true, lastName: true } } } },
        activities: {
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        accountManager: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        portalUser: { select: { id: true, firstName: true, lastName: true, email: true, status: true, lastLoginAt: true } },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found.");
    }

    return {
      ...client,
      lastContactAt: client.activities[0]?.completedAt ?? client.activities[0]?.createdAt ?? null,
    };
  }

  async update(id: string, dto: Partial<CreateClientDto>, actorId?: string) {
    const clean = this.sanitize(dto);

    if (clean.email) {
      const clash = await this.prisma.client.findFirst({
        where: { email: clean.email, id: { not: id } },
      });
      if (clash) {
        throw new BadRequestException(
          `A client with email "${clean.email}" already exists (${clash.companyName}).`,
        );
      }
    }

    // Capture old row for diff
    const before = await this.prisma.client.findUnique({
      where: { id },
      select: {
        companyName: true, priority: true, status: true, tags: true,
        accountManagerId: true, email: true, phone: true,
      },
    });

    try {
      const data: Prisma.ClientUncheckedUpdateInput = {
        ...(clean as Prisma.ClientUncheckedUpdateInput),
        tags: Array.isArray(dto.tags) ? dto.tags : undefined,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : undefined,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
      };
      const updated = await this.prisma.client.update({
        where: { id },
        data,
        include: {
          accountManager: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // Diff summary for audit log
      if (actorId && before) {
        const changes: string[] = [];
        const diff = (k: string, old: unknown, now: unknown) => {
          if (JSON.stringify(old) !== JSON.stringify(now) && now !== undefined) {
            changes.push(`${k}: ${JSON.stringify(old)} → ${JSON.stringify(now)}`);
          }
        };
        diff("name", before.companyName, updated.companyName);
        diff("priority", before.priority, updated.priority);
        diff("status", before.status, updated.status);
        diff("email", before.email, updated.email);
        diff("phone", before.phone, updated.phone);
        diff("accountManager", before.accountManagerId, updated.accountManagerId);
        diff("tags", before.tags, updated.tags);
        if (changes.length) {
          await this.logActivity(actorId, ActivityAction.UPDATED, updated, changes.join("; "));
        }
      }
      return updated;
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new BadRequestException("A client with these details already exists.");
      }
      throw err;
    }
  }

  async remove(id: string, actorId?: string) {
    const existing = await this.prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { projects: true, invoices: true, contracts: true, proposals: true } },
      },
    });
    if (!existing) return { success: true, alreadyDeleted: true };

    // Grab name for the audit log before we nuke the row
    const row = await this.prisma.client.findUnique({ where: { id }, select: { companyName: true } });

    const { projects, invoices, contracts, proposals } = existing._count;
    if (projects || invoices || contracts || proposals) {
      const parts: string[] = [];
      if (projects) parts.push(`${projects} project${projects > 1 ? "s" : ""}`);
      if (invoices) parts.push(`${invoices} invoice${invoices > 1 ? "s" : ""}`);
      if (contracts) parts.push(`${contracts} contract${contracts > 1 ? "s" : ""}`);
      if (proposals) parts.push(`${proposals} proposal${proposals > 1 ? "s" : ""}`);
      throw new BadRequestException(
        `Cannot delete client — they still have ${parts.join(", ")}. Delete or reassign those first.`,
      );
    }

    await this.prisma.document.updateMany({
      where: { clientId: id },
      data: { clientId: null },
    });

    await this.prisma.client.delete({ where: { id } });
    if (actorId && row) await this.logActivity(actorId, ActivityAction.DELETED, { id, companyName: row.companyName });
    return { success: true };
  }

  // ── Tags discovery ────────────────────────────────────────────────────────
  async listTags(): Promise<string[]> {
    const rows = await this.prisma.client.findMany({ select: { tags: true } });
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags) if (t) set.add(t);
    return [...set].sort();
  }

  // ── Audit trail ───────────────────────────────────────────────────────────
  async getHistory(clientId: string) {
    return this.prisma.activityLog.findMany({
      where: { entityType: "client", entityId: clientId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  // ── Merge duplicates ──────────────────────────────────────────────────────
  async merge(primaryId: string, duplicateId: string, actorId?: string) {
    if (primaryId === duplicateId) throw new BadRequestException("Cannot merge a client into itself.");

    const [primary, duplicate] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: primaryId } }),
      this.prisma.client.findUnique({ where: { id: duplicateId } }),
    ]);
    if (!primary || !duplicate) throw new NotFoundException("One or both clients not found.");

    // Move every foreign relation from duplicate → primary.
    await this.prisma.$transaction([
      this.prisma.project.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.invoice.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.contract.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.proposal.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.document.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.contact.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.deal.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.activity.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.estimate.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.payment.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.creditNote.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
      this.prisma.recurringInvoice.updateMany({ where: { clientId: duplicateId }, data: { clientId: primaryId } }),
    ]);

    // Merge tags (union) and fill missing fields on primary from duplicate.
    const mergedTags = Array.from(new Set([...(primary.tags ?? []), ...(duplicate.tags ?? [])]));
    const fill = {
      contactPerson: primary.contactPerson ?? duplicate.contactPerson,
      email: primary.email ?? (duplicate.email && duplicate.email !== primary.email ? duplicate.email : primary.email),
      phone: primary.phone ?? duplicate.phone,
      address: primary.address ?? duplicate.address,
      website: primary.website ?? duplicate.website,
      industry: primary.industry ?? duplicate.industry,
      city: primary.city ?? duplicate.city,
      country: primary.country ?? duplicate.country,
      referralSource: primary.referralSource ?? duplicate.referralSource,
      accountManagerId: primary.accountManagerId ?? duplicate.accountManagerId,
      notes: [primary.notes, duplicate.notes && `Merged from ${duplicate.companyName}: ${duplicate.notes}`]
        .filter(Boolean)
        .join("\n\n") || undefined,
    };

    // Duplicate's email is now orphaned — null it first so the primary can claim it later if needed.
    if (duplicate.email) {
      await this.prisma.client.update({ where: { id: duplicateId }, data: { email: null } });
    }

    const updated = await this.prisma.client.update({
      where: { id: primaryId },
      data: { ...fill, tags: mergedTags },
    });

    await this.prisma.client.delete({ where: { id: duplicateId } });

    if (actorId) {
      await this.logActivity(
        actorId,
        ActivityAction.UPDATED,
        { id: primaryId, companyName: primary.companyName },
        `Merged "${duplicate.companyName}" into this client`,
      );
    }

    return { success: true, primary: updated };
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async bulkUpdate(body: {
    ids: string[];
    priority?: string;
    status?: string;
    accountManagerId?: string | null;
    addTags?: string[];
    removeTags?: string[];
  }) {
    if (!body.ids?.length) return { updated: 0 };

    const updates: Record<string, unknown> = {};
    if (body.priority) updates.priority = body.priority;
    if (body.status) updates.status = body.status;
    if (body.accountManagerId !== undefined) updates.accountManagerId = body.accountManagerId || null;

    // Simple field updates first
    if (Object.keys(updates).length) {
      await this.prisma.client.updateMany({
        where: { id: { in: body.ids } },
        data: updates,
      });
    }

    // Tag add/remove requires per-row processing (string array manipulation)
    if (body.addTags?.length || body.removeTags?.length) {
      const clients = await this.prisma.client.findMany({
        where: { id: { in: body.ids } },
        select: { id: true, tags: true },
      });
      await Promise.all(
        clients.map((c) => {
          const set = new Set(c.tags ?? []);
          (body.addTags ?? []).forEach((t) => t && set.add(t));
          (body.removeTags ?? []).forEach((t) => set.delete(t));
          return this.prisma.client.update({
            where: { id: c.id },
            data: { tags: [...set] },
          });
        }),
      );
    }

    return { updated: body.ids.length };
  }

  async bulkDelete(ids: string[]) {
    if (!ids?.length) return { deleted: 0 };

    // Refuse any client with linked projects/invoices/contracts/proposals
    const blockers = await this.prisma.client.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        companyName: true,
        _count: { select: { projects: true, invoices: true, contracts: true, proposals: true } },
      },
    });
    const blocked = blockers.filter(
      (c) => c._count.projects || c._count.invoices || c._count.contracts || c._count.proposals,
    );
    if (blocked.length) {
      throw new BadRequestException(
        `Cannot delete ${blocked.length} client(s) with linked records: ${blocked.map((b) => b.companyName).join(", ")}`,
      );
    }

    await this.prisma.document.updateMany({
      where: { clientId: { in: ids } },
      data: { clientId: null },
    });

    const res = await this.prisma.client.deleteMany({ where: { id: { in: ids } } });
    return { deleted: res.count };
  }

  // ── CSV Import ────────────────────────────────────────────────────────────

  async importCsv(rows: Array<Record<string, string>>) {
    const created: string[] = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const contactPerson = (row.contactPerson || row["Contact"] || row["Contact Person"] || "").trim();
      const email = row.email || row["Email"];
      const emailLocalPart = email ? String(email).split("@")[0]?.trim() : "";
      // Company name is OPTIONAL on import. Fall back to contact person,
      // then to the email's local part, so person-level imports (Meta
      // Lead Ads, Google Forms) ingest with a sensible placeholder the
      // user can rename later. Only skip the row if NONE of those exist.
      const rawCompanyName = row.companyName || row["Company"] || row["Company Name"] || row.name;
      const companyName = (rawCompanyName?.trim() || contactPerson || emailLocalPart);
      if (!companyName) {
        skipped.push({ row: i + 1, reason: "Missing company / contact / email — nothing to identify this client" });
        continue;
      }
      if (email) {
        const clash = await this.prisma.client.findFirst({ where: { email } });
        if (clash) {
          skipped.push({ row: i + 1, reason: `Email ${email} already exists` });
          continue;
        }
      }

      try {
        const client = await this.prisma.client.create({
          data: {
            companyName,
            contactPerson: contactPerson || null,
            email: email || null,
            phone: row.phone || row["Phone"] || null,
            website: row.website || row["Website"] || null,
            address: row.address || row["Address"] || null,
            industry: row.industry || row["Industry"] || null,
            city: row.city || row["City"] || null,
            country: row.country || row["Country"] || null,
            priority: (row.priority || row["Priority"] || "MEDIUM").toUpperCase() as any,
            status: row.status || row["Status"] || "ACTIVE",
            referralSource: row.referralSource || row["Referral"] || row["Source"] || null,
            tags: row.tags
              ? String(row.tags)
                  .split(/[,;|]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
              : [],
          },
        });
        created.push(client.id);
      } catch (err: any) {
        skipped.push({ row: i + 1, reason: err.message ?? "Create failed" });
      }
    }

    return { createdCount: created.length, skippedCount: skipped.length, skipped };
  }

  // ── Client Portal ─────────────────────────────────────────────────────────

  async invitePortal(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true, companyName: true, email: true, contactPerson: true,
        portalUser: { select: { id: true, email: true } },
      },
    });
    if (!client) throw new NotFoundException("Client not found.");
    if (!client.email) {
      throw new BadRequestException("Client has no email on file. Add an email before inviting.");
    }
    if (client.portalUser) {
      // Already invited — just flip the enabled flag on and return the existing user
      await this.prisma.client.update({
        where: { id: clientId },
        data: { portalEnabled: true },
      });
      return {
        success: true,
        alreadyInvited: true,
        user: client.portalUser,
      };
    }

    // Check email isn't taken by another user
    const existingUser = await this.prisma.user.findUnique({ where: { email: client.email } });
    if (existingUser) {
      await this.prisma.client.update({
        where: { id: clientId },
        data: { portalUserId: existingUser.id, portalEnabled: true },
      });
      return { success: true, existingUser: true, user: { id: existingUser.id, email: existingUser.email } };
    }

    // Create a new portal user with a random temp password
    const tempPassword = randomBytes(8).toString("hex");
    const clientRole = await this.prisma.role.findUnique({ where: { code: RoleCode.CLIENT } });
    if (!clientRole) throw new BadRequestException("CLIENT role not found in the system.");

    const [firstName, ...restName] = (client.contactPerson ?? client.companyName).split(" ");
    const lastName = restName.join(" ") || "(Client)";

    const user = await this.prisma.user.create({
      data: {
        email: client.email,
        passwordHash: hashPassword(tempPassword),
        firstName: firstName || "Client",
        lastName,
        status: UserStatus.INVITED,
        roles: { create: [{ roleId: clientRole.id }] },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    await this.prisma.client.update({
      where: { id: clientId },
      data: { portalUserId: user.id, portalEnabled: true },
    });

    // Fire-and-forget email to the client with their temp password. If mail is
    // not configured this is a no-op — the admin still gets the password in the response.
    const emailSent = await this.sendInviteEmail(client.email, tempPassword, client.companyName).catch(() => false);

    return { success: true, user, tempPassword, emailSent };
  }

  private async sendInviteEmail(email: string, password: string, company: string): Promise<boolean> {
    try {
      await this.mail.sendTemplateEmail(email, `Your ${company} portal access`, {
        name: company,
        tempPassword: password,
        portalUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/login`,
      });
      return true;
    } catch {
      return false;
    }
  }

  async revokePortal(clientId: string) {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { portalEnabled: false },
    });
    return { success: true };
  }
}
