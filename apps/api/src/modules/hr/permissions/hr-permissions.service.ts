import { ForbiddenException, Injectable } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  EmployeeAction,
  EmployeeOverviewSource,
  EmployeeTabKey,
  MaskedOverviewDto,
  Relationship,
  ViewerContext,
  ViewerLevel,
} from "./hr-permissions.types";

const HR_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER];
const FINANCE_ROLES: RoleCode[] = [RoleCode.FINANCE_MANAGER];

@Injectable()
export class HrPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  viewerLevel(viewer: ViewerContext): ViewerLevel {
    if (viewer.roles.some((r) => HR_ROLES.includes(r))) return "HR";
    if (viewer.roles.some((r) => FINANCE_ROLES.includes(r))) return "FINANCE";
    return "PEER";
  }

  async relationshipTo(viewer: ViewerContext, targetUserId: string): Promise<Relationship> {
    if (viewer.id === targetUserId) return "SELF";

    // Direct manager via EmployeeProfile.managerId
    const directReport = await this.prisma.employeeProfile.findFirst({
      where: { userId: targetUserId, managerId: viewer.id },
      select: { id: true },
    });
    if (directReport) return "MANAGER";

    // Project manager: viewer manages a project the target is a member of
    if (viewer.roles.includes(RoleCode.PROJECT_MANAGER)) {
      const sharedProject = await this.prisma.project.findFirst({
        where: {
          managerId: viewer.id,
          members: { some: { userId: targetUserId } },
        },
        select: { id: true },
      });
      if (sharedProject) return "MANAGER";
    }

    return "OTHER";
  }

  canAccessTab(level: ViewerLevel, relationship: Relationship, tab: EmployeeTabKey): boolean {
    // Access management (per-user module overrides) is HR-only. Even self
    // can't change their own access — that prevents a non-admin from
    // self-granting modules.
    if (tab === "access") return level === "HR";

    // HR sees everything
    if (level === "HR") return true;

    // Finance: overview, attendance, payroll, career, timeline
    if (level === "FINANCE") {
      return (
        tab === "overview" ||
        tab === "attendance" ||
        tab === "payroll" ||
        tab === "career" ||
        tab === "timeline"
      );
    }

    // Self: full access except payroll and notes
    if (relationship === "SELF") {
      return tab !== "payroll" && tab !== "notes";
    }

    // Manager (of this target): everything except payroll, documents, notes
    if (relationship === "MANAGER") {
      return tab !== "payroll" && tab !== "documents" && tab !== "notes";
    }

    // Peer: overview only (with field masking applied separately)
    return tab === "overview";
  }

  assertCanWriteAction(
    level: ViewerLevel,
    relationship: Relationship,
    action: EmployeeAction,
  ): void {
    const allow = (() => {
      switch (action) {
        case "VIEW":
          return true;
        case "EDIT_PROFILE":
        case "TERMINATE":
        case "RESEND_INVITE":
        case "LOG_CAREER_EVENT":
        case "ADD_HR_NOTE":
        case "DELETE_HR_NOTE":
        case "UPLOAD_DOCUMENT":
        case "DELETE_DOCUMENT":
          return level === "HR";
        case "EDIT_OWN_LIMITED":
          return relationship === "SELF";
        case "APPROVE_LEAVE":
          return level === "HR" || relationship === "MANAGER";
        case "WRITE_REVIEW":
          return level === "HR" || relationship === "MANAGER";
        default:
          return false;
      }
    })();

    if (!allow) {
      throw new ForbiddenException(`Action ${action} not permitted`);
    }
  }

  maskOverview(
    level: ViewerLevel,
    relationship: Relationship,
    src: EmployeeOverviewSource,
  ): MaskedOverviewDto {
    const showSalary = level === "HR" || level === "FINANCE" || relationship === "SELF";
    const showSensitive = level === "HR" || relationship === "SELF";
    const showPerf = level === "HR" || relationship === "SELF" || relationship === "MANAGER";
    const showTerm = level === "HR" || relationship === "SELF" || relationship === "MANAGER";

    const num = (v: unknown): number | null =>
      v == null ? null : typeof v === "number" ? v : Number(v);

    return {
      userId: src.user.id,
      firstName: src.user.firstName,
      lastName: src.user.lastName,
      email: src.user.email,
      avatarUrl: src.user.avatarUrl,
      phone: showSensitive ? src.user.phone : null,
      status: src.user.status,
      joinDate: src.profile?.joinDate ? src.profile.joinDate.toISOString() : null,
      department: src.profile?.department ?? null,
      designation: src.profile?.designation ?? null,
      employmentType: src.profile?.employmentType ?? null,
      salary: showSalary ? num(src.profile?.salary) : null,
      hourlyRate: showSalary ? num(src.profile?.hourlyRate) : null,
      manager:
        showSensitive || level === "FINANCE" || relationship === "MANAGER"
          ? src.managerLabel
          : null,
      // Expose the raw manager FK so the HR edit dialog can pre-fill the
      // Select with the right user. Only HR / self see it — same band as
      // salary, since the reporting line itself is sensitive metadata.
      managerId: showSalary ? (src.profile?.managerId ?? null) : null,
      emergencyContact: showSensitive ? (src.profile?.emergencyContact ?? null) : null,
      performanceScore: showPerf ? num(src.profile?.performanceScore) : null,
      terminated: showTerm ? !!src.profile?.terminatedAt : false,
      // Expose the termination date itself (not just the boolean) so the
      // header can show "Terminated · DD MMM YYYY". Same access-control as
      // the `terminated` flag — non-HR viewers don't see it.
      terminatedAt:
        showTerm && src.profile?.terminatedAt
          ? src.profile.terminatedAt.toISOString()
          : null,
      // Founder flag is broadcast publicly — a "Founder" badge on the
      // header is non-sensitive metadata (founders are usually listed on
      // company websites anyway).
      isFounder: !!src.profile?.isFounder,
      // Per-employee shift override. Same access band as salary — HR /
      // self / finance can see it; co-workers can't.
      shiftStartHour: showSalary ? (src.profile?.shiftStartHour ?? null) : null,
      shiftStartMinute: showSalary ? (src.profile?.shiftStartMinute ?? null) : null,
      shiftEndHour: showSalary ? (src.profile?.shiftEndHour ?? null) : null,
      shiftEndMinute: showSalary ? (src.profile?.shiftEndMinute ?? null) : null,
      requiredDailyHours:
        showSalary && src.profile?.requiredDailyHours != null
          ? Number(src.profile.requiredDailyHours)
          : null,
    };
  }
}
