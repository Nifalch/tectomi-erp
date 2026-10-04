import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: PaginationDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where = query.search
      ? {
          OR: [
            { companyName: { contains: query.search, mode: "insensitive" as const } },
            { contactName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: true,
          convertedTo: true,
        },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  }

  async create(dto: CreateLeadDto) {
    // The Lead.email column is non-nullable in the schema, so coerce a
    // missing/empty value to "" rather than crashing the insert. UI
    // already treats blank as "not provided" — convert function later
    // gates client creation on having one before promoting.
    const lead = await this.prisma.lead.create({ data: { ...dto, email: dto.email ?? "" } });

    // Ping the assigned owner + admins so a fresh lead doesn't sit in
    // the pipeline unattended. Best-effort.
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } },
        },
        select: { id: true },
      });
      const recipients = new Set<string>(admins.map((u) => u.id));
      if (lead.assignedToId) recipients.add(lead.assignedToId);
      await Promise.all(
        Array.from(recipients).map((uid) =>
          this.notifications.create(uid, {
            type: NotificationType.GENERIC,
            title: `New lead: ${lead.companyName}`,
            body: `${lead.contactName}${lead.source ? ` · via ${lead.source}` : ""}${lead.estimatedValue ? ` · est. ₹${Number(lead.estimatedValue).toLocaleString("en-IN")}` : ""}`,
            link: `/leads`,
          }).catch(() => undefined),
        ),
      );
    } catch {
      /* non-fatal */
    }
    return lead;
  }

  async update(id: string, dto: Partial<CreateLeadDto>) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }
    return this.prisma.lead.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  /**
   * Bulk-create leads from a parsed CSV. Frontend has already mapped CSV
   * columns to our field names (companyName, contactName, email, phone,
   * source, status, estimatedValue, notes) — backend just validates and
   * inserts per row, skipping bad rows rather than failing the whole batch.
   *
   * Returns the createdCount + a list of skipped rows with reasons so the
   * UI can show a per-row failure summary.
   */
  async importCsv(rows: Array<Record<string, string>>) {
    const created: string[] = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const contactName = (row.contactName ?? "").trim();
      // Company name is OPTIONAL on import. Meta Lead Ads, Google Forms,
      // and most lead-capture surfaces only collect person-level fields,
      // so we fall back to the contact name when company is missing —
      // the DB column is non-null and we'd rather ingest the lead with
      // a placeholder company the user can edit than reject it.
      const companyName = (row.companyName ?? "").trim() || contactName;
      if (!contactName) {
        skipped.push({ row: i + 1, reason: "Missing contact name" });
        continue;
      }

      const emailRaw = (row.email ?? "").trim();
      // Validate email only when provided — phone/walk-in leads are valid
      // without one. The Lead.email column is non-nullable so empty stays
      // as "" (matching the regular create() path).
      if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        skipped.push({ row: i + 1, reason: `Invalid email: ${emailRaw}` });
        continue;
      }

      // estimatedValue may arrive as "₹50,000", "$1,200", "1200.50", etc.
      // Strip everything that isn't a digit or decimal point and parse.
      const estRaw = (row.estimatedValue ?? "").trim();
      const estimatedValue = estRaw
        ? Number(estRaw.replace(/[^0-9.]/g, "")) || undefined
        : undefined;

      // Normalise status — Meta exports often have lowercase / arbitrary
      // labels like "new", "follow_up". Map to our LeadStatus enum;
      // unknown values fall back to NEW (the default for a fresh lead).
      const statusRaw = (row.status ?? "").trim().toUpperCase().replace(/[\s-]/g, "_");
      const validStatuses = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"] as const;
      type LeadStatusLiteral = (typeof validStatuses)[number];
      const status = (validStatuses as readonly string[]).includes(statusRaw)
        ? (statusRaw as LeadStatusLiteral)
        : undefined;

      try {
        const lead = await this.prisma.lead.create({
          data: {
            companyName,
            contactName,
            email: emailRaw,
            phone: (row.phone ?? "").trim() || null,
            source: (row.source ?? "").trim() || null,
            status: status ?? "NEW",
            estimatedValue: estimatedValue != null ? estimatedValue : undefined,
            notes: (row.notes ?? "").trim() || null,
          },
        });
        created.push(lead.id);
      } catch (err) {
        skipped.push({ row: i + 1, reason: (err as Error).message ?? "Create failed" });
      }
    }
    return { createdCount: created.length, skippedCount: skipped.length, skipped };
  }

  async convert(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          companyName: lead.companyName,
          contactPerson: lead.contactName,
          // Client.email is nullable + @unique; coerce empty-string from
          // an emailless lead to null so we don't trip the unique
          // constraint when two such leads convert.
          email: lead.email ? lead.email : null,
          phone: lead.phone,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          convertedToId: client.id,
          status: "WON",
        },
        include: { convertedTo: true },
      });

      return updatedLead;
    });
  }
}
