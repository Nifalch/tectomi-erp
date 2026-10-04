import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";

@Injectable()
export class PortalMeService {
  constructor(private readonly prisma: PrismaService) {}

  async me(contactId: string, clientId: string) {
    const [contact, org] = await Promise.all([
      this.prisma.clientContact.findUnique({ where: { id: contactId } }),
      this.prisma.organizationSettings.findFirst().catch(() => null),
    ]);
    return {
      contactId,
      clientId,
      name: contact?.name ?? null,
      email: contact?.email ?? "",
      // The /me payload doubles as the source of truth for the portal's
      // invoice and proposal renders — they reuse the staff-side print
      // components which need the full org letterhead (logo, address,
      // bank details, etc.). Avoids a second org-public endpoint.
      orgName: org?.name ?? "Portal",
      orgLegalName: org?.legalName ?? null,
      orgLogoUrl: org?.logoUrl ?? null,
      orgStampUrl: org?.stampUrl ?? null,
      baseCurrency: org?.baseCurrency ?? "INR",
      orgEmail: org?.email ?? null,
      orgPhone: org?.phone ?? null,
      orgWebsite: org?.website ?? null,
      orgAddress: org
        ? [org.addressLine1, org.addressLine2, org.city, org.state].filter(Boolean).join(", ")
        : null,
      orgAddressLine1: org?.addressLine1 ?? null,
      orgAddressLine2: org?.addressLine2 ?? null,
      orgCity: org?.city ?? null,
      orgState: org?.state ?? null,
      orgPostalCode: org?.postalCode ?? null,
      orgCountry: org?.country ?? null,
      // Bank / payment details for invoice footer.
      bankName: org?.bankName ?? null,
      bankAccountNumber: org?.bankAccountNumber ?? null,
      bankAccountHolder: org?.bankAccountHolder ?? null,
      bankBranch: org?.bankBranch ?? null,
      bankIfsc: org?.bankIfsc ?? null,
      bankUpi: org?.bankUpi ?? null,
      invoiceTerms: org?.invoiceTerms ?? null,
    };
  }

  async dashboard(clientId: string) {
    const now = new Date();
    // 1. Pull every active project for this client up front. Most of the
    //    dashboard's value lives on a per-project breakdown (budget,
    //    outstanding, last update) — the global "total outstanding" tile
    //    is then just the sum of those per-project numbers.
    const activeProjects = await this.prisma.project.findMany({
      where: { clientId, status: "ACTIVE" },
      include: {
        milestones: { select: { status: true } },
        // Most-recently-touched task surfaces as "last update" on each
        // project tile. Cheap to fetch one per project here vs a separate
        // round-trip.
        tasks: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { id: true, title: true, status: true, updatedAt: true },
        },
      },
    });
    const activeProjectIds = activeProjects.map((p) => p.id);

    // 2. Pull ALL non-DRAFT/VOID invoices for this client — covers both
    //    active-project rollups AND the global outstanding tile. Using a
    //    single query for both keeps the dashboard tile and the
    //    "Recent invoices" panel consistent: previously the tile summed
    //    only active-project outstandings while the list also showed
    //    null-project invoices, which created a visible mismatch
    //    (₹0 outstanding on the card vs. a SENT invoice for ₹50k below).
    const [allClientInvoices, nextMilestone, openRequestCount, recentRequests] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { clientId, status: { notIn: ["DRAFT", "VOID"] } },
          select: {
            id: true,
            projectId: true,
            status: true,
            total: true,
            invoiceNumber: true,
            createdAt: true,
            allocations: { select: { amount: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.milestone.findFirst({
          where: { project: { clientId, status: "ACTIVE" }, dueDate: { gte: now } },
          orderBy: { dueDate: "asc" },
          select: { id: true, title: true, dueDate: true, project: { select: { id: true, name: true } } },
        }),
        this.prisma.clientRequest.count({ where: { clientId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        this.prisma.clientRequest.findMany({
          where: { clientId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, status: true, updatedAt: true },
        }),
      ]);

    // Per-project rollups: invoicedTotal = sum of totals across all
    // non-DRAFT/non-VOID invoices on ACTIVE projects only (those drive
    // the per-project tiles).
    const invoicedByProject = new Map<string, number>();
    const paidByProject = new Map<string, number>();
    for (const inv of allClientInvoices) {
      if (!inv.projectId || !activeProjectIds.includes(inv.projectId)) continue;
      const total = Number(inv.total);
      invoicedByProject.set(inv.projectId, (invoicedByProject.get(inv.projectId) ?? 0) + total);
      const allocs = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const credited = inv.status === "PAID" ? total : Math.min(total, allocs);
      paidByProject.set(inv.projectId, (paidByProject.get(inv.projectId) ?? 0) + credited);
    }

    // Recent invoices = newest 5 across the whole client (same set the
    // outstanding tile is computed from, so the numbers always line up).
    const recentInvoices = allClientInvoices.slice(0, 5);

    const projects = activeProjects.map((p) => {
      const invoiced = invoicedByProject.get(p.id) ?? 0;
      const paid = paidByProject.get(p.id) ?? 0;
      const totalMilestones = p.milestones.length;
      const doneMilestones = p.milestones.filter((m) => m.status === "DONE").length;
      const progressPercent = totalMilestones > 0
        ? Math.round((doneMilestones / totalMilestones) * 100)
        : 0;
      const lastTask = p.tasks[0];
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        budget: Number(p.budget ?? 0),
        invoicedTotal: invoiced,
        paidTotal: paid,
        outstanding: Math.max(0, invoiced - paid),
        progressPercent,
        milestoneCount: totalMilestones,
        completedMilestones: doneMilestones,
        lastUpdate: lastTask
          ? {
              taskId: lastTask.id,
              title: lastTask.title,
              status: lastTask.status,
              at: lastTask.updatedAt.toISOString(),
            }
          : null,
      };
    });

    // Total outstanding is computed from EVERY non-DRAFT/VOID invoice
    // on this client — same set the "Recent invoices" panel pulls from.
    // Previously this was sum-of-active-project-outstandings, which
    // dropped invoices on completed projects and client-level invoices
    // (no projectId) and left the dashboard tile contradicting the list.
    const totalOutstanding = allClientInvoices.reduce((s, inv) => {
      const total = Number(inv.total);
      const allocs = inv.allocations.reduce((a, x) => a + Number(x.amount), 0);
      const credited = inv.status === "PAID" ? total : Math.min(total, allocs);
      return s + Math.max(0, total - credited);
    }, 0);

    // 3. Aggregate recent updates across all active projects for the
    //    "what's been happening" feed on the dashboard.
    const recentUpdates = activeProjectIds.length === 0
      ? []
      : (await this.prisma.task.findMany({
          where: { projectId: { in: activeProjectIds } },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            project: { select: { id: true, name: true } },
          },
        })).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          at: t.updatedAt.toISOString(),
          projectId: t.project.id,
          projectName: t.project.name,
          kind: t.status === "DONE" ? "completed" : t.status === "IN_PROGRESS" ? "in_progress" : "update",
        }));

    return {
      activeProjectCount: activeProjects.length,
      nextMilestone,
      // Aggregate across EVERY non-DRAFT/VOID invoice on this client —
      // matches the "Recent invoices" panel below so the dashboard tile
      // and the list always tell the same story.
      outstandingBalance: totalOutstanding,
      openRequestCount,
      projects,
      recentUpdates,
      recentInvoices: recentInvoices.map((i) => ({
        id: i.id,
        number: i.invoiceNumber,
        total: i.total,
        status: i.status,
        issueDate: i.createdAt,
        projectId: i.projectId,
      })),
      recentRequests,
    };
  }
}
