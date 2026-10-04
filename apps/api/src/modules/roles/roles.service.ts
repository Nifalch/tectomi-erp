import { Injectable, NotFoundException } from "@nestjs/common";
import { PermissionAction, RoleCode } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });
  }

  async getMatrix() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
      },
      orderBy: { name: "asc" },
    });
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });

    const grants: Record<string, Record<string, boolean>> = {};
    for (const role of roles) {
      grants[role.code] = {};
      for (const rp of role.permissions) {
        grants[role.code][`${rp.permission.resource}:${rp.permission.action}`] = true;
      }
    }

    return { roles, permissions, grants };
  }

  async getRolePermissions(code: RoleCode) {
    const role = await this.prisma.role.findUnique({
      where: { code },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException("Role not found.");
    return role;
  }

  async setRolePermissions(
    code: RoleCode,
    body: { permissions: Array<{ resource: string; action: PermissionAction; granted: boolean }> },
  ) {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) throw new NotFoundException("Role not found.");

    // Upsert permission master rows for any that don't exist yet
    const permissionIds: Record<string, string> = {};
    for (const p of body.permissions) {
      const key = `${p.resource}:${p.action}`;
      const existing = await this.prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        create: {
          resource: p.resource,
          action: p.action,
          name: `${p.resource}.${p.action.toLowerCase()}`,
          description: `${p.action} access on ${p.resource}`,
        },
        update: {},
      });
      permissionIds[key] = existing.id;
    }

    // Apply grants
    const granted = body.permissions.filter((p) => p.granted);
    const revoked = body.permissions.filter((p) => !p.granted);

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: { in: revoked.map((p) => permissionIds[`${p.resource}:${p.action}`]) },
        },
      }),
      ...granted.map((p) =>
        this.prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permissionIds[`${p.resource}:${p.action}`],
            },
          },
          create: {
            roleId: role.id,
            permissionId: permissionIds[`${p.resource}:${p.action}`],
          },
          update: {},
        }),
      ),
    ]);

    return this.getRolePermissions(code);
  }

  async seedDefaultPermissions() {
    // Creates a standard set of resources × actions if the permission table is empty
    const count = await this.prisma.permission.count();
    if (count > 0) return { seeded: false, existing: count };

    const resources = [
      "users", "roles", "clients", "projects", "tasks", "time-entries", "attendance",
      "leave", "hr", "payroll", "performance", "assets", "announcements",
      "timesheets", "finance", "invoices", "estimates", "bills", "payments",
      "credit-notes", "chart-accounts", "tax-rates", "items", "bank-accounts",
      "journal-entries", "recurring-invoices", "org-settings", "proposals", "leads",
      "contacts", "deals", "activities", "reports", "documents", "notifications",
      "goals", "vendors", "calendar", "onboarding",
    ];
    const actions: PermissionAction[] = [
      "READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT",
    ];

    const rows = [];
    for (const resource of resources) {
      for (const action of actions) {
        rows.push({
          resource,
          action,
          name: `${resource}.${action.toLowerCase()}`,
          description: `${action} access on ${resource}`,
        });
      }
    }

    await this.prisma.permission.createMany({ data: rows, skipDuplicates: true });
    return { seeded: true, count: rows.length };
  }
}
