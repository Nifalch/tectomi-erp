import { config } from "dotenv";
config();
config({ path: "../../.env" });

import {
  PrismaClient,
  RoleCode,
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

interface TeamMemberDef {
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  designation: string;
  salary: number;
  roles: RoleCode[];
}

const TEAM_MEMBERS: TeamMemberDef[] = [
  {
    email: "nifal@tectomi.com",
    firstName: "Nifal",
    lastName: "C H",
    department: "Leadership",
    designation: "CEO & Super Admin",
    salary: 250000,
    roles: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN],
  },
  {
    email: "admin@tectomi.com",
    firstName: "Tectomi",
    lastName: "Admin",
    department: "Operations",
    designation: "System Administrator",
    salary: 200000,
    roles: [RoleCode.SUPER_ADMIN, RoleCode.ADMIN],
  },
  {
    email: "binshi@tectomi.com",
    firstName: "Binshi",
    lastName: "VP",
    department: "Sales & Delivery",
    designation: "Head of Sales & Operations",
    salary: 185000,
    roles: [
      RoleCode.ADMIN,
      RoleCode.PROJECT_MANAGER,
      RoleCode.FINANCE_MANAGER,
      RoleCode.HR_MANAGER,
    ],
  },
  {
    email: "shamil@tectomi.com",
    firstName: "Shamil",
    lastName: "Tech",
    department: "Engineering",
    designation: "Lead Full-Stack Developer",
    salary: 150000,
    roles: [RoleCode.EMPLOYEE],
  },
  {
    email: "nifli@tectomi.com",
    firstName: "Nifli",
    lastName: "Tech",
    department: "Engineering",
    designation: "Software Engineer",
    salary: 140000,
    roles: [RoleCode.EMPLOYEE],
  },
  {
    email: "ajlan@tectomi.com",
    firstName: "Ajlan",
    lastName: "Marketing",
    department: "Marketing",
    designation: "Marketing Lead",
    salary: 135000,
    roles: [RoleCode.EMPLOYEE],
  },
];

async function main() {
  console.log("--------------------------------------------------");
  console.log("   Tectomi ERP - Team & Password Configuration    ");
  console.log("--------------------------------------------------");
  console.log(`Setting default password: "${DEFAULT_PASSWORD}"\n`);

  // 1. Ensure all standard roles exist
  const roleMap = new Map<RoleCode, string>();
  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: code.replaceAll("_", " ") },
      create: {
        code,
        name: code.replaceAll("_", " "),
      },
    });
    roleMap.set(code, role.id);
  }

  // 2. Upsert each team member
  const results: Array<{
    name: string;
    email: string;
    roles: string;
    department: string;
    designation: string;
  }> = [];

  for (const member of TEAM_MEMBERS) {
    const passwordHash = hashPassword(DEFAULT_PASSWORD);

    const user = await prisma.user.upsert({
      where: { email: member.email.toLowerCase() },
      update: {
        firstName: member.firstName,
        lastName: member.lastName,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: member.email.toLowerCase(),
        firstName: member.firstName,
        lastName: member.lastName,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    // Reset and assign user roles
    await prisma.userRole.deleteMany({
      where: { userId: user.id },
    });

    for (const roleCode of member.roles) {
      const roleId = roleMap.get(roleCode);
      if (roleId) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId,
          },
        });
      }
    }

    // Upsert employee profile
    await prisma.employeeProfile.upsert({
      where: { userId: user.id },
      update: {
        department: member.department,
        designation: member.designation,
        salary: member.salary,
        employmentType: EmploymentType.FULL_TIME,
      },
      create: {
        userId: user.id,
        department: member.department,
        designation: member.designation,
        salary: member.salary,
        joinDate: new Date(),
        employmentType: EmploymentType.FULL_TIME,
        performanceScore: 5.0,
      },
    });

    results.push({
      name: `${member.firstName} ${member.lastName}`,
      email: member.email,
      roles: member.roles.join(", "),
      department: member.department,
      designation: member.designation,
    });
  }

  console.table(results);
  console.log(`\nSuccessfully upserted ${results.length} team accounts!`);
  console.log(`All accounts password set to: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Failed to upsert team accounts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
