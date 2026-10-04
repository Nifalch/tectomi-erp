import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EmploymentEventType, LeaveStatus, Prisma, RoleCode, UserStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { hashPassword } from "../auth/password.util";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeProfileDto } from "./dto/update-employee-profile.dto";

const HOURLY_RATE_ROLES: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.FINANCE_MANAGER,
  RoleCode.HR_MANAGER,
];

function extractRoleCodes(
  current: { roles?: RoleCode[] | Array<{ role: { code: RoleCode | string } }> } | undefined,
): string[] {
  if (!current?.roles) return [];
  return Array.isArray(current.roles)
    ? current.roles.map((r: any) => (typeof r === "string" ? r : r?.role?.code)).filter(Boolean)
    : [];
}

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async overview() {
    const [employees, pendingLeaves, avgPerformance] = await this.prisma.$transaction([
      this.prisma.employeeProfile.findMany({
        include: {
          user: {
            include: { roles: { include: { role: true } } },
          },
        },
        orderBy: { joinDate: "desc" },
      }),
      this.prisma.leaveRequest.count({ where: { status: LeaveStatus.PENDING } }),
      this.prisma.employeeProfile.aggregate({
        _avg: {
          performanceScore: true,
        },
      }),
    ]);

    return {
      employees,
      metrics: {
        employeeCount: employees.length,
        pendingLeaves,
        averagePerformance: avgPerformance._avg.performanceScore ?? 0,
      },
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateEmployeeProfileDto,
    actor?: { id: string; roles?: RoleCode[] | Array<{ role: { code: RoleCode | string } }> },
  ) {
    // Gate `hourlyRate` edits — only specific roles can set/change it.
    // Employees who PATCH through here simply have the field silently stripped.
    const actorRoles = extractRoleCodes(actor);
    const canEditHourlyRate = actorRoles.some((c) => HOURLY_RATE_ROLES.includes(c as RoleCode));

    const { hourlyRate, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (canEditHourlyRate && hourlyRate !== undefined) {
      data.hourlyRate = hourlyRate;
    }
    // Normalize "no manager" — Selects emit "" for unset, but the column is
    // a nullable FK so it needs a real null. Also defend against self-reports.
    if (data.managerId === "") data.managerId = null;
    if (data.managerId && data.managerId === userId) {
      throw new BadRequestException("An employee can't report to themselves.");
    }

    // Upsert — the profile may not exist yet (users created outside HR won't
    // have one). `update` alone throws P2025 in that case, which surfaces as a
    // generic 500 → "Failed to update employee" toast.
    // EmployeeProfile has several non-nullable columns (department, designation,
    // salary, joinDate, employmentType). Provide sensible defaults on first
    // create so HR can fill them in after.
    return this.prisma.employeeProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        department: (data.department as string) ?? "",
        designation: (data.designation as string) ?? "",
        salary: (data.salary as number) ?? 0,
        joinDate: new Date(),
        employmentType: (data.employmentType as any) ?? "FULL_TIME",
        ...(canEditHourlyRate && hourlyRate !== undefined ? { hourlyRate } : {}),
      } as any,
    });
  }

  async createEmployee(dto: CreateEmployeeDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("A user with this email already exists.");
    }

    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException("One or more roles are invalid.");
    }

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException("Manager user not found.");
    }

    const tempPassword = this.generateTempPassword();

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash: hashPassword(tempPassword),
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            status: UserStatus.INVITED,
            roles: {
              create: roles.map((r) => ({ roleId: r.id })),
            },
            employeeProfile: {
              create: {
                department: dto.department,
                designation: dto.designation,
                salary: new Prisma.Decimal(dto.salary),
                hourlyRate: dto.hourlyRate != null ? new Prisma.Decimal(dto.hourlyRate) : null,
                joinDate: new Date(dto.joinDate),
                employmentType: dto.employmentType,
                managerId: dto.managerId ?? null,
              },
            },
          },
          include: {
            employeeProfile: true,
            roles: { include: { role: true } },
          },
        });

        await tx.employmentStatusEvent.create({
          data: {
            employeeId: user.employeeProfile!.id,
            type: EmploymentEventType.HIRED,
            toValue: dto.designation,
            effectiveDate: new Date(dto.joinDate),
            reason: "New hire",
            createdById: actorId,
          },
        });

        if (dto.sendOnboardingChecklist && dto.onboardingChecklistId) {
          const template = await tx.onboardingChecklist.findUnique({
            where: { id: dto.onboardingChecklistId },
            include: { items: true },
          });
          if (!template) {
            throw new BadRequestException(
              `Onboarding checklist template "${dto.onboardingChecklistId}" not found.`,
            );
          }
          await tx.onboardingChecklist.create({
            data: {
              title: `${template.title} — ${user.firstName} ${user.lastName}`,
              description: template.description,
              items: {
                create: template.items.map((item) => ({
                  title: item.title,
                  sortOrder: item.sortOrder,
                  assigneeId: user.id,
                })),
              },
            },
          });
        }

        return user;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BadRequestException("A user with this email already exists.");
      }
      throw err;
    }

    // Fire-and-forget invite email; treat failure as soft warning.
    void this.mail
      .sendTemplateEmail(result.email, "Welcome to Tectomi ERP — your account is ready", {
        name: `${result.firstName} ${result.lastName}`,
        tempPassword,
        portalUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/login`,
      })
      .catch((err) => this.logger.warn(`Invite email failed: ${(err as Error).message}`));

    return { user: result, tempPassword };
  }

  private generateTempPassword(): string {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join("");
  }
}
