import { Injectable } from "@nestjs/common";
import { LeaveStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  HubAlert,
  HubAnniversary,
  HubChartData,
  HubDirectorySnapshot,
  HubKpis,
  HubOnboardingItem,
  HubPendingApproval,
  HubResponse,
  HubReviewItem,
} from "./hub.types";

@Injectable()
export class HubService {
  constructor(private readonly prisma: PrismaService) {}

  async getHub(): Promise<HubResponse> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const last12MonthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      activeEmployees,
      terminatedThisQuarter,
      newHiresThisMonth,
      pendingLeaves,
      allEmployees,
      attendanceThisMonth,
      onboardingItems,
      upcomingReviewRows,
      anniversaryProfiles,
      recentHires,
      paySlipsMtd,
    ] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: {
          id: true,
          joinDate: true,
          department: true,
          designation: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.employeeProfile.count({
        where: { terminatedAt: { gte: startOfQuarter } },
      }),
      this.prisma.employeeProfile.count({
        where: { joinDate: { gte: startOfMonth }, terminatedAt: null },
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: LeaveStatus.PENDING },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: {
          id: true,
          department: true,
          joinDate: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { date: { gte: startOfMonth } },
        select: { checkIn: true, userId: true },
      }),
      this.prisma.onboardingItem.findMany({
        where: { assigneeId: { not: null } },
        include: {
          checklist: { select: { id: true, title: true } },
        },
      }),
      this.prisma.performanceReview.findMany({
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1) } },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          cycle: { select: { reviewType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Anniversary candidates — anyone with a joinDate. Filter in memory (cheap).
      this.prisma.employeeProfile.findMany({
        where: { terminatedAt: null },
        select: {
          joinDate: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.employeeProfile.findMany({
        where: {
          terminatedAt: null,
          joinDate: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
        },
        orderBy: { joinDate: "desc" },
        take: 5,
        select: {
          joinDate: true,
          department: true,
          designation: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.paySlip.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { netSalary: true },
      }),
    ]);

    // ── KPIs ──
    const headcount = activeEmployees.length;
    const totalTenureDays = activeEmployees.reduce(
      (sum, e) => sum + Math.max(0, (now.getTime() - e.joinDate.getTime()) / (1000 * 60 * 60 * 24)),
      0,
    );
    const averageTenureYears = headcount > 0 ? totalTenureDays / 365 / headcount : 0;
    const attrition =
      headcount + terminatedThisQuarter > 0
        ? terminatedThisQuarter / (headcount + terminatedThisQuarter)
        : 0;
    const payrollCostMtd = paySlipsMtd.reduce((s, p) => s + Number(p.netSalary), 0);
    const kpis: HubKpis = {
      headcount,
      newHiresThisMonth,
      attritionThisQuarter: Math.round(attrition * 10000) / 100, // percent with 2 decimals
      averageTenureYears: Math.round(averageTenureYears * 10) / 10,
      openPositions: 0, // no Position model yet
      payrollCostMtd,
    };

    // ── Alerts (probation ending; late-arrival not modelled in current schema) ──
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const alerts: HubAlert[] = [];

    // Probation ending soon: hired 80-90 days ago (assume 90-day probation).
    const probEnd = activeEmployees.filter((e) => {
      const days = (now.getTime() - e.joinDate.getTime()) / (1000 * 60 * 60 * 24);
      return days >= 80 && days <= 90;
    });
    for (const e of probEnd) {
      alerts.push({
        id: `prob-${e.id}`,
        kind: "PROBATION_ENDING_SOON",
        userId: e.userId,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        detail: "Probation period ending in <10 days",
        severity: "info",
      });
    }

    // ── Anniversaries (next 7 days, milestone years 1, 3, 5, 10, 15, 20) ──
    const milestones = [1, 3, 5, 10, 15, 20];
    const anniversaries: HubAnniversary[] = [];
    for (const ep of anniversaryProfiles) {
      const j = ep.joinDate;
      // Compute next anniversary date this year.
      const nextAnniv = new Date(now.getFullYear(), j.getMonth(), j.getDate());
      if (nextAnniv < today) nextAnniv.setFullYear(nextAnniv.getFullYear() + 1);
      const daysAway = Math.round((nextAnniv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAway >= 0 && daysAway <= 7) {
        const yearsAt = nextAnniv.getFullYear() - j.getFullYear();
        if (milestones.includes(yearsAt)) {
          anniversaries.push({
            userId: ep.userId,
            userName: `${ep.user.firstName} ${ep.user.lastName}`,
            joinDate: ep.joinDate.toISOString(),
            yearsAt,
            daysAway,
          });
        }
      }
    }
    anniversaries.sort((a, b) => a.daysAway - b.daysAway);

    // ── Onboarding queue (group items by assignee + checklist) ──
    // OnboardingItem has assigneeId but no relation, so resolve names with a separate user fetch.
    const assigneeIds = Array.from(
      new Set(onboardingItems.map((i) => i.assigneeId).filter((v): v is string => !!v)),
    );
    const assignees = assigneeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const assigneeById = new Map(assignees.map((u) => [u.id, u]));

    type Bucket = {
      userId: string;
      userName: string;
      checklistTitle: string;
      total: number;
      done: number;
      startedAt: Date;
    };
    const onboardingMap = new Map<string, Bucket>();
    for (const item of onboardingItems) {
      if (!item.assigneeId) continue;
      const assignee = assigneeById.get(item.assigneeId);
      if (!assignee) continue;
      const key = `${assignee.id}-${item.checklistId}`;
      if (!onboardingMap.has(key)) {
        onboardingMap.set(key, {
          userId: assignee.id,
          userName: `${assignee.firstName} ${assignee.lastName}`,
          checklistTitle: item.checklist.title,
          total: 0,
          done: 0,
          startedAt: item.createdAt,
        });
      }
      const b = onboardingMap.get(key)!;
      b.total += 1;
      if (item.completed) b.done += 1;
      if (item.createdAt < b.startedAt) b.startedAt = item.createdAt;
    }
    const onboarding: HubOnboardingItem[] = Array.from(onboardingMap.values())
      .filter((b) => b.done < b.total) // only show incomplete
      .map((b) => ({
        userId: b.userId,
        userName: b.userName,
        checklistTitle: b.checklistTitle,
        doneCount: b.done,
        totalCount: b.total,
        startedAt: b.startedAt.toISOString(),
      }))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    // ── Upcoming reviews (the model has no scheduled date; surface latest reviews as "recent") ──
    const upcomingReviews: HubReviewItem[] = upcomingReviewRows.map((r) => ({
      reviewId: r.id,
      userId: r.employee.id,
      userName: `${r.employee.firstName} ${r.employee.lastName}`,
      reviewType: r.cycle?.reviewType ?? "Review",
      scheduledFor: null,
      overdue: false,
    }));

    // ── Pending approvals (leaves) ──
    const pendingApprovals: HubPendingApproval[] = pendingLeaves.map((l) => ({
      kind: "LEAVE" as const,
      id: l.id,
      userId: l.user.id,
      userName: `${l.user.firstName} ${l.user.lastName}`,
      summary: `${l.leaveType} ${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()}`,
      createdAt: l.createdAt.toISOString(),
    }));

    // ── Charts ──
    const deptCount = new Map<string, number>();
    for (const e of allEmployees) {
      deptCount.set(
        e.department || "Unassigned",
        (deptCount.get(e.department || "Unassigned") ?? 0) + 1,
      );
    }
    const departmentBreakdown = Array.from(deptCount.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    const buckets: Array<{ ym: string; label: string; joins: number; leaves: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short" }),
        joins: 0,
        leaves: 0,
      });
    }
    const ymOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    for (const e of allEmployees) {
      const k = ymOf(e.joinDate);
      const b = buckets.find((x) => x.ym === k);
      if (b) b.joins += 1;
    }
    const allLeaves = await this.prisma.leaveRequest.findMany({
      where: { createdAt: { gte: last12MonthStart } },
      select: { createdAt: true },
    });
    for (const l of allLeaves) {
      const k = ymOf(l.createdAt);
      const b = buckets.find((x) => x.ym === k);
      if (b) b.leaves += 1;
    }
    let running = 0;
    const headcountTrend = buckets.map((b) => {
      running += b.joins;
      return { label: b.label, value: running };
    });
    const leaveRequestsTrend = buckets.map((b) => ({ label: b.label, value: b.leaves }));

    // Real attendance-rate calculation.
    //
    // The previous logic was a gimmick: it filtered the attendance table by
    // `checkIn !== null`, but rows only exist when someone clocks in, so the
    // result was always 100%. To get a meaningful rate we need a denominator
    // that includes *expected* attendance — i.e. (working days so far in the
    // month) × (active employees on each of those days).
    //
    // We approximate "active on day D" with "active right now AND joined on
    // or before D AND not terminated before D" — enough fidelity for a
    // dashboard headline without joining per-day membership tables.
    const policyRow = await this.prisma.attendancePolicy.findFirst();
    const workingDaysMask = policyRow?.workingDaysMask ?? 0b1111110; // Mon-Sat default
    const holidays = await this.prisma.holiday.findMany({
      where: { date: { gte: startOfMonth, lt: now } },
      select: { date: true },
    });
    const holidayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const holidaySet = new Set(holidays.map((h) => holidayKey(h.date)));

    // Active employees right now, with their joinDate + terminatedAt so we
    // can include them in the denominator only for days they were eligible.
    const employeesForRate = await this.prisma.employeeProfile.findMany({
      select: { joinDate: true, terminatedAt: true },
    });

    let expectedAttendances = 0;
    const cursor = new Date(startOfMonth);
    while (cursor <= now) {
      const dow = cursor.getDay();
      const isWorkingDow = ((workingDaysMask >> dow) & 1) === 1;
      const isHoliday = holidaySet.has(holidayKey(cursor));
      if (isWorkingDow && !isHoliday) {
        const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        for (const e of employeesForRate) {
          const joined = new Date(e.joinDate);
          if (joined > dayStart) continue;
          if (e.terminatedAt && new Date(e.terminatedAt) < dayStart) continue;
          expectedAttendances += 1;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const actualAttendances = attendanceThisMonth.length;
    const attendanceRateThisMonth = expectedAttendances > 0
      ? Math.min(100, Math.round((actualAttendances / expectedAttendances) * 100))
      : 0;

    const charts: HubChartData = {
      departmentBreakdown,
      headcountTrend,
      leaveRequestsTrend,
      attendanceRateThisMonth,
      attendanceActualThisMonth: actualAttendances,
      attendanceExpectedThisMonth: expectedAttendances,
    };

    // ── Directory snapshot ──
    const directorySnapshot: HubDirectorySnapshot = {
      total: headcount,
      recentHires: recentHires.map((e) => ({
        userId: e.userId,
        userName: `${e.user.firstName} ${e.user.lastName}`,
        designation: e.designation,
        department: e.department,
        joinDate: e.joinDate.toISOString(),
      })),
    };

    return {
      kpis,
      alerts,
      anniversaries,
      onboarding,
      upcomingReviews,
      pendingApprovals,
      charts,
      directorySnapshot,
    };
  }

  /** Recursive org-chart from EmployeeProfile.managerId. */
  async getOrgChart() {
    const employees = await this.prisma.employeeProfile.findMany({
      where: { terminatedAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    type Node = {
      userId: string;
      name: string;
      designation: string;
      department: string;
      avatarUrl: string | null;
      reports: Node[];
    };
    const byUserId = new Map<string, Node>();
    for (const e of employees) {
      byUserId.set(e.userId, {
        userId: e.userId,
        name: `${e.user.firstName} ${e.user.lastName}`,
        designation: e.designation,
        department: e.department,
        avatarUrl: e.user.avatarUrl,
        reports: [],
      });
    }
    const roots: Node[] = [];
    for (const e of employees) {
      const node = byUserId.get(e.userId)!;
      if (e.managerId && byUserId.has(e.managerId)) {
        byUserId.get(e.managerId)!.reports.push(node);
      } else {
        roots.push(node);
      }
    }
    return { roots };
  }
}
