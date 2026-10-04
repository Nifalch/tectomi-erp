import { config } from "dotenv";
config();
config({ path: "../../.env" });

import {
  PrismaClient,
  RoleCode,
  PermissionAction,
  UserStatus,
  EmploymentType,
} from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "Tectomi@123";
const passwordHash = hashPassword(DEFAULT_PASSWORD);

const permissionSeeds = [
  ["users", PermissionAction.READ],
  ["users", PermissionAction.CREATE],
  ["users", PermissionAction.UPDATE],
  ["users", PermissionAction.DELETE],
  ["users", PermissionAction.INVITE],
  ["clients", PermissionAction.READ],
  ["clients", PermissionAction.CREATE],
  ["clients", PermissionAction.UPDATE],
  ["projects", PermissionAction.READ],
  ["projects", PermissionAction.CREATE],
  ["projects", PermissionAction.UPDATE],
  ["projects", PermissionAction.ASSIGN],
  ["tasks", PermissionAction.READ],
  ["tasks", PermissionAction.CREATE],
  ["tasks", PermissionAction.UPDATE],
  ["tasks", PermissionAction.COMMENT],
  ["hr", PermissionAction.READ],
  ["hr", PermissionAction.APPROVE],
  ["finance", PermissionAction.READ],
  ["finance", PermissionAction.CREATE],
  ["finance", PermissionAction.UPDATE],
  ["invoices", PermissionAction.READ],
  ["invoices", PermissionAction.CREATE],
  ["invoices", PermissionAction.SEND],
  ["reports", PermissionAction.READ],
  ["reports", PermissionAction.EXPORT],
  ["documents", PermissionAction.READ],
  ["documents", PermissionAction.UPLOAD],
  ["settings", PermissionAction.READ],
  ["settings", PermissionAction.UPDATE],
] as const;

const rolePermissions: Record<RoleCode, Array<[string, PermissionAction]>> = {
  SUPER_ADMIN: permissionSeeds as unknown as Array<[string, PermissionAction]>,
  ADMIN: permissionSeeds.filter(([resource]) => resource !== "settings") as unknown as Array<[string, PermissionAction]>,
  PROJECT_MANAGER: [
    ["clients", PermissionAction.READ],
    ["projects", PermissionAction.READ],
    ["projects", PermissionAction.UPDATE],
    ["projects", PermissionAction.ASSIGN],
    ["tasks", PermissionAction.READ],
    ["tasks", PermissionAction.CREATE],
    ["tasks", PermissionAction.UPDATE],
    ["tasks", PermissionAction.COMMENT],
    ["reports", PermissionAction.READ],
    ["documents", PermissionAction.READ],
    ["documents", PermissionAction.UPLOAD],
  ],
  HR_MANAGER: [
    ["users", PermissionAction.READ],
    ["hr", PermissionAction.READ],
    ["hr", PermissionAction.APPROVE],
    ["reports", PermissionAction.READ],
    ["documents", PermissionAction.READ],
  ],
  FINANCE_MANAGER: [
    ["clients", PermissionAction.READ],
    ["finance", PermissionAction.READ],
    ["finance", PermissionAction.CREATE],
    ["finance", PermissionAction.UPDATE],
    ["invoices", PermissionAction.READ],
    ["invoices", PermissionAction.CREATE],
    ["invoices", PermissionAction.SEND],
    ["reports", PermissionAction.READ],
    ["reports", PermissionAction.EXPORT],
  ],
  EMPLOYEE: [
    ["projects", PermissionAction.READ],
    ["tasks", PermissionAction.READ],
    ["tasks", PermissionAction.UPDATE],
    ["tasks", PermissionAction.COMMENT],
    ["documents", PermissionAction.READ],
  ],
  CLIENT: [
    ["projects", PermissionAction.READ],
    ["invoices", PermissionAction.READ],
    ["documents", PermissionAction.READ],
  ],
};

async function main() {
  console.log("==================================================");
  console.log("   TECTOMI ERP - CLEAN DATABASE & INITIAL SETUP   ");
  console.log("==================================================");

  // 1. Fetch all user tables in public schema except migrations
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename != '_prisma_migrations';
  `);

  if (tables.length > 0) {
    const tableNames = tables.map((t) => `"${t.tablename}"`).join(", ");
    console.log(`Truncating ${tables.length} tables with CASCADE...`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} CASCADE;`);
    console.log("All old data, demo data, and dummy records wiped cleanly.");
  }

  // 2. Seed Permissions
  console.log("Seeding permissions...");
  await Promise.all(
    permissionSeeds.map(([resource, action]) =>
      prisma.permission.create({
        data: {
          resource,
          action,
          name: `${resource}:${action.toLowerCase()}`,
        },
      }),
    ),
  );

  // 3. Seed Roles with RolePermissions
  console.log("Seeding roles & permissions...");
  const roles = await Promise.all(
    Object.values(RoleCode).map((code) =>
      prisma.role.create({
        data: {
          code,
          name: code.replaceAll("_", " "),
          permissions: {
            create: rolePermissions[code].map(([resource, action]) => ({
              permission: {
                connect: {
                  resource_action: {
                    resource,
                    action,
                  },
                },
              },
            })),
          },
        },
      }),
    ),
  );

  const superAdminRole = roles.find((r) => r.code === RoleCode.SUPER_ADMIN)!;
  const adminRole = roles.find((r) => r.code === RoleCode.ADMIN)!;
  const pmRole = roles.find((r) => r.code === RoleCode.PROJECT_MANAGER)!;
  const financeRole = roles.find((r) => r.code === RoleCode.FINANCE_MANAGER)!;
  const hrRole = roles.find((r) => r.code === RoleCode.HR_MANAGER)!;
  const employeeRole = roles.find((r) => r.code === RoleCode.EMPLOYEE)!;

  // 4. Seed Organization Settings
  console.log("Configuring Tectomi organization settings...");
  await prisma.organizationSettings.create({
    data: {
      name: "Tectomi ERP",
      legalName: "Tectomi Technologies Pvt. Ltd.",
      email: "contact@tectomi.com",
      website: "https://tectomi.com",
      country: "India",
      baseCurrency: "INR",
      invoicePrefix: "TEC-INV-",
      estimatePrefix: "TEC-EST-",
      billPrefix: "TEC-BILL-",
      creditNotePrefix: "TEC-CN-",
      ceoName: "Nifal C H",
      ceoTitle: "CEO & Founder",
      aboutCompany: "Tectomi is a premier technology development and engineering firm delivering high-performance digital platforms and enterprise solutions.",
    },
  });

  // 5. Seed Clean Team Users
  console.log("Creating team accounts...");

  // 1. Nifal — Super Admin & CEO ("all in all")
  await prisma.user.create({
    data: {
      email: "nifal@tectomi.com",
      passwordHash,
      firstName: "Nifal",
      lastName: "C H",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [
          { roleId: superAdminRole.id },
          { roleId: adminRole.id },
        ],
      },
      employeeProfile: {
        create: {
          department: "Leadership",
          designation: "CEO & Super Admin",
          salary: 250000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // Standard Admin convenience account
  await prisma.user.create({
    data: {
      email: "admin@tectomi.com",
      passwordHash,
      firstName: "Tectomi",
      lastName: "Admin",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [
          { roleId: superAdminRole.id },
          { roleId: adminRole.id },
        ],
      },
      employeeProfile: {
        create: {
          department: "Operations",
          designation: "System Administrator",
          salary: 200000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // 2. Binshi — Sales and all-in-all (Admin, PM, Finance, HR)
  await prisma.user.create({
    data: {
      email: "binshi@tectomi.com",
      passwordHash,
      firstName: "Binshi",
      lastName: "VP",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [
          { roleId: adminRole.id },
          { roleId: pmRole.id },
          { roleId: financeRole.id },
          { roleId: hrRole.id },
        ],
      },
      employeeProfile: {
        create: {
          department: "Sales & Delivery",
          designation: "Head of Sales & Operations",
          salary: 185000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // 3. Shamil — Developer and Tech
  await prisma.user.create({
    data: {
      email: "shamil@tectomi.com",
      passwordHash,
      firstName: "Shamil",
      lastName: "Tech",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: employeeRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Engineering",
          designation: "Lead Full-Stack Developer",
          salary: 150000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // 4. Nifli — Developer and Tech
  await prisma.user.create({
    data: {
      email: "nifli@tectomi.com",
      passwordHash,
      firstName: "Nifli",
      lastName: "Tech",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: employeeRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Engineering",
          designation: "Software Engineer",
          salary: 140000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // 5. Ajlan — Marketing
  await prisma.user.create({
    data: {
      email: "ajlan@tectomi.com",
      passwordHash,
      firstName: "Ajlan",
      lastName: "Marketing",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: employeeRole.id }],
      },
      employeeProfile: {
        create: {
          department: "Marketing",
          designation: "Marketing Lead",
          salary: 135000,
          joinDate: new Date(),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  console.log("\n==================================================");
  console.log("   DATABASE CLEANED & READY FOR PRODUCTION!       ");
  console.log("==================================================");
  console.log("Team accounts seeded:");
  console.log("- nifal@tectomi.com    (Super Admin & CEO)");
  console.log("- admin@tectomi.com    (Super Admin & SysAdmin)");
  console.log("- binshi@tectomi.com   (Sales & All-in-all)");
  console.log("- shamil@tectomi.com   (Developer & Tech)");
  console.log("- nifli@tectomi.com    (Developer & Tech)");
  console.log("- ajlan@tectomi.com    (Marketing)");
  console.log(`Default Password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("Clean script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
