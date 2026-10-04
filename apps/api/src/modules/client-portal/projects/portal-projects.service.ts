import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { serializeMilestone, serializeProject, serializeTask } from "../serializers";

/**
 * Client-portal view of the project. Exposes the project alongside its
 * tasks, milestones, hours-logged rollup, payment cycle, and the
 * project coordinator. Internal cost / hourly rates / profit margins
 * etc. are kept off the wire by selecting only public fields. All
 * tasks belonging to a client's project are shown — the older
 * `isClientVisible` filter was creating an empty Tasks tab in practice
 * because new tasks default to false.
 */
@Injectable()
export class PortalProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const projects = await this.prisma.project.findMany({
      where: { clientId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { milestones: true } },
      },
    });

    // Pull task + time stats per project in a single round-trip rather
    // than fanning out a query per project — keeps the list page snappy
    // even for clients with dozens of projects.
    const projectIds = projects.map((p) => p.id);
    const [taskStats, timeStats, milestoneStats, invoiceTotals] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _count: true,
      }),
      this.prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _sum: { duration: true },
      }),
      // Milestone progress drives the progress bar (was task-based, but
      // milestones are what the client actually tracks against on a
      // services engagement — tasks are too granular).
      this.prisma.milestone.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _count: true,
      }),
      this.prisma.invoice.findMany({
        where: { projectId: { in: projectIds }, status: { notIn: ["DRAFT", "VOID"] } },
        select: {
          id: true,
          projectId: true,
          status: true,
          total: true,
          allocations: { select: { amount: true } },
        },
      }),
    ]);

    // Per-project finance rollups. paidTotal honours invoice.status:
    // PAID counts the full total even if allocations are missing
    // (legacy data), otherwise we use the sum of allocations capped
    // at the invoice total so partial payments behave correctly.
    const invoicedByProject = new Map<string, { total: number; count: number }>();
    const paidByProject = new Map<string, number>();
    for (const inv of invoiceTotals) {
      const pid = inv.projectId;
      if (!pid) continue;
      const total = Number(inv.total);
      const cur = invoicedByProject.get(pid) ?? { total: 0, count: 0 };
      invoicedByProject.set(pid, { total: cur.total + total, count: cur.count + 1 });
      const allocs = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const credited = inv.status === "PAID" ? total : Math.min(total, allocs);
      paidByProject.set(pid, (paidByProject.get(pid) ?? 0) + credited);
    }

    return projects.map((p) => {
      const taskByStatus = taskStats.filter((t) => t.projectId === p.id);
      const totalTasks = taskByStatus.reduce((s, t) => s + t._count, 0);
      const doneTasks = taskByStatus.find((t) => t.status === "DONE")?._count ?? 0;
      const milestoneByStatus = milestoneStats.filter((m) => m.projectId === p.id);
      const totalMilestones = milestoneByStatus.reduce((s, m) => s + m._count, 0);
      const doneMilestones = milestoneByStatus.find((m) => m.status === "DONE")?._count ?? 0;
      // Prefer milestone-driven progress; fall back to tasks when a
      // project has no milestones set up yet.
      const progressPercent = totalMilestones > 0
        ? Math.round((doneMilestones / totalMilestones) * 100)
        : totalTasks > 0
          ? Math.round((doneTasks / totalTasks) * 100)
          : 0;
      const minutes = timeStats.find((t) => t.projectId === p.id)?._sum.duration ?? 0;
      const invRollup = invoicedByProject.get(p.id) ?? { total: 0, count: 0 };
      const paid = paidByProject.get(p.id) ?? 0;
      return {
        ...serializeProject(p),
        totalTasks,
        completedTasks: doneTasks,
        milestoneCount: totalMilestones,
        completedMilestones: doneMilestones,
        completionPercent: progressPercent,
        hoursLogged: Math.round((minutes / 60) * 10) / 10,
        description: p.description ?? null,
        // Per-project finance — used by the dashboard's project breakdown.
        budget: Number(p.budget ?? 0),
        invoicedTotal: invRollup.total,
        invoiceCount: invRollup.count,
        paidTotal: paid,
        outstanding: Math.max(0, invRollup.total - paid),
      };
    });
  }

  /**
   * Detail page payload — same project plus richer breakdowns the
   * dashboard list doesn't carry: milestones, task stats per status,
   * team avatars (assignees on this project's client-visible tasks),
   * and a recent updates feed.
   */
  async detail(clientId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, clientId },
      include: {
        milestones: { orderBy: { dueDate: "asc" } },
        client: { select: { companyName: true } },
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
        },
        // Payment milestones drive the "payment cycle" panel on the
        // portal — usually 3 entries like Advance / Mid / Final with
        // percentages that sum to 100. invoiceId links each line to
        // its issued invoice so the portal can show status + due date.
        paymentMilestones: {
          orderBy: { sortOrder: "asc" },
          include: { invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } } },
        },
      },
    });
    if (!project) throw new NotFoundException();

    const [taskStats, timeStats, team, recentTasks, paidInvoices, projectInvoicesFull] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["status"],
        where: { projectId: id },
        _count: true,
      }),
      this.prisma.timeEntry.aggregate({
        where: { projectId: id },
        _sum: { duration: true },
      }),
      this.prisma.task.findMany({
        where: { projectId: id, assignedToId: { not: null } },
        select: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        distinct: ["assignedToId"],
      }),
      // Recent activity — the most recently touched tasks give a
      // clean "what's happening" picture for the client.
      this.prisma.task.findMany({
        where: { projectId: id },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.prisma.invoice.aggregate({
        where: { projectId: id, status: "PAID" },
        _sum: { total: true },
        _count: true,
      }),
      // All non-DRAFT/non-VOID invoices for this project. Used for both
      // the finance rollup (invoiced vs paid) and the Budget-tab
      // invoice list. paidTotal honours invoice.status (PAID = full
      // total) so legacy "marked PAID without a payment record" rows
      // still count as collected.
      this.prisma.invoice.findMany({
        where: { projectId: id, status: { notIn: ["DRAFT", "VOID"] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          createdAt: true,
          dueDate: true,
          allocations: { select: { amount: true } },
        },
      }),
    ]);

    const taskByStatus = Object.fromEntries(taskStats.map((t) => [t.status, t._count])) as Record<string, number>;
    const totalTasks = taskStats.reduce((s, t) => s + t._count, 0);
    const done = taskByStatus["DONE"] ?? 0;
    const inProgress = taskByStatus["IN_PROGRESS"] ?? 0;
    const todo = totalTasks - done - inProgress;
    const minutes = timeStats._sum.duration ?? 0;
    // Milestone-driven progress: count DONE / total milestones. Clients
    // care more about delivery checkpoints than raw task counts on a
    // services engagement. Falls back to tasks if no milestones.
    const totalMilestones = project.milestones.length;
    const doneMilestones = project.milestones.filter((m) => m.status === "DONE").length;
    const milestonePercent = totalMilestones > 0
      ? Math.round((doneMilestones / totalMilestones) * 100)
      : totalTasks > 0
        ? Math.round((done / totalTasks) * 100)
        : 0;

    return {
      ...serializeProject(project),
      description: project.description ?? null,
      milestones: project.milestones.map(serializeMilestone),
      // Project manager card on the portal: name + email + phone +
      // avatar so the client can reach their PM directly without
      // pinging support.
      manager: project.manager
        ? {
            id: project.manager.id,
            name: `${project.manager.firstName ?? ""} ${project.manager.lastName ?? ""}`.trim() || project.manager.email,
            email: project.manager.email,
            phone: project.manager.phone ?? null,
            avatarUrl: project.manager.avatarUrl ?? null,
          }
        : null,
      stats: {
        totalTasks,
        completedTasks: done,
        inProgressTasks: inProgress,
        todoTasks: todo,
        completionPercent: milestonePercent,
        hoursLogged: Math.round((minutes / 60) * 10) / 10,
        milestoneCount: totalMilestones,
        completedMilestones: doneMilestones,
        paidInvoiceCount: paidInvoices._count,
        paidInvoiceTotal: paidInvoices._sum.total ?? 0,
      },
      team: team
        .map((t) => t.assignedTo)
        .filter(Boolean)
        .map((u) => ({
          id: u!.id,
          name: `${u!.firstName ?? ""} ${u!.lastName ?? ""}`.trim() || "Team member",
          avatarUrl: u!.avatarUrl ?? null,
        })),
      recentUpdates: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        at: t.updatedAt.toISOString(),
        kind: t.status === "DONE" ? "completed" : t.status === "IN_PROGRESS" ? "in_progress" : "update",
      })),
      // Financial summary. paidTotal is derived from invoice.status:
      // PAID counts the full total even if no PaymentAllocation row
      // exists (covers invoices marked paid manually outside the
      // payments flow). Anything else falls back to summed allocations.
      // This is what makes the dashboard, the Budget tab, and the
      // invoice list visually reconcile.
      finance: (() => {
        let invoicedTotal = 0;
        let paidTotal = 0;
        for (const inv of projectInvoicesFull) {
          const total = Number(inv.total);
          invoicedTotal += total;
          const allocs = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
          const credited = inv.status === "PAID" ? total : Math.min(total, allocs);
          paidTotal += credited;
        }
        return {
          budget: Number(project.budget ?? 0),
          invoicedTotal,
          invoiceCount: projectInvoicesFull.length,
          paidTotal,
          outstanding: Math.max(0, invoicedTotal - paidTotal),
        };
      })(),
      paymentCycle: project.paymentMilestones.map((m) => {
        // The row's headline amount is the *expected* milestone amount —
        // for regular milestones, budget × percentage. For extras /
        // change orders, the milestone carries its own direct amount.
        // The linked invoice (if any) is exposed separately so the UI
        // can surface the actual issued amount underneath; mismatches
        // between expected and issued are flagged.
        const expected = m.isExtra
          ? Number(m.amount ?? 0)
          : Math.round(Number(project.budget ?? 0) * (Number(m.percentage) / 100) * 100) / 100;
        return {
          id: m.id,
          label: m.label,
          percentage: Number(m.percentage),
          isExtra: !!m.isExtra,
          amount: expected,
          status: m.status,
          dueDate: m.dueDate ? m.dueDate.toISOString() : null,
          invoice: m.invoice
            ? {
                id: m.invoice.id,
                number: m.invoice.invoiceNumber,
                status: m.invoice.status,
                total: Number(m.invoice.total),
              }
            : null,
        };
      }),
      // Full invoice list for the Budget tab — every non-DRAFT/non-VOID
      // invoice on this project, freshest first. Lets the client click
      // through to any of them without bouncing back to the Invoices nav.
      invoices: projectInvoicesFull.map((inv) => ({
        id: inv.id,
        number: inv.invoiceNumber,
        total: Number(inv.total),
        status: inv.status,
        issueDate: inv.createdAt.toISOString(),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      })),
    };
  }

  async tasks(clientId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, clientId } });
    if (!project) throw new NotFoundException();
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        priority: true,
        progressPercent: true,
        assignedTo: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    return tasks.map((t) => ({
      ...serializeTask(t),
      progressPercent: t.progressPercent ?? 0,
      assignee: t.assignedTo
        ? {
            name: `${t.assignedTo.firstName ?? ""} ${t.assignedTo.lastName ?? ""}`.trim() || null,
            avatarUrl: t.assignedTo.avatarUrl ?? null,
          }
        : null,
    }));
  }
}
