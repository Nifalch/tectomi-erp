import { config } from "dotenv";
config();
config({ path: "../../.env" });

import {
  PrismaClient,
  RoleCode,
  PermissionAction,
  ProjectStatus,
  TaskStatus,
  Priority,
  EmploymentType,
  LeaveType,
  LeaveStatus,
  InvoiceStatus,
  ProposalStatus,
  UserStatus,
  MilestoneStatus,
  TransactionType,
  DocumentEntityType,
} from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const passwordHash = hashPassword(process.env.SEED_DEFAULT_PASSWORD || "Tectomi@123");

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
  await prisma.rolePermission.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.clientRequestMessage.deleteMany();
  await prisma.clientRequest.deleteMany();
  await prisma.clientPortalSession.deleteMany();
  await prisma.clientMagicLink.deleteMany();
  await prisma.proposalAcceptance.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.hrNote.deleteMany();
  await prisma.employmentStatusEvent.deleteMany();
  await prisma.reportExport.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.resourceAllocation.deleteMany();
  await prisma.proposalBlock.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.revenue.deleteMany();
  await prisma.promotionHistory.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.client.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  const permissions = await Promise.all(
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

  const superAdminRole = roles.find((role) => role.code === RoleCode.SUPER_ADMIN)!;
  const adminRole = roles.find((role) => role.code === RoleCode.ADMIN)!;
  const pmRole = roles.find((role) => role.code === RoleCode.PROJECT_MANAGER)!;
  const financeRole = roles.find((role) => role.code === RoleCode.FINANCE_MANAGER)!;
  const hrRole = roles.find((role) => role.code === RoleCode.HR_MANAGER)!;
  const employeeRole = roles.find((role) => role.code === RoleCode.EMPLOYEE)!;
  const clientRole = roles.find((role) => role.code === RoleCode.CLIENT)!;

  // 1. Nifal — Super Admin & CEO ("all in all")
  const nifal = await prisma.user.create({
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
          joinDate: new Date("2024-01-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 5.0,
        },
      },
    },
  });

  // Also seed admin@tectomi.com with Super Admin access for standard admin login convenience
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
          joinDate: new Date("2024-01-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.9,
        },
      },
    },
  });

  // 2. Binshi — Sales and all-in-all (Admin, PM, Finance, HR)
  const binshi = await prisma.user.create({
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
          joinDate: new Date("2024-02-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.8,
        },
      },
    },
  });

  // 3. Shamil — Developer and Tech
  const shamil = await prisma.user.create({
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
          joinDate: new Date("2024-03-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.7,
        },
      },
    },
  });

  // 4. Nifli — Developer and Tech
  const nifli = await prisma.user.create({
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
          joinDate: new Date("2024-03-15"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.6,
        },
      },
    },
  });

  // 5. Ajlan — Marketing
  const ajlan = await prisma.user.create({
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
          joinDate: new Date("2024-04-01"),
          employmentType: EmploymentType.FULL_TIME,
          performanceScore: 4.5,
        },
      },
    },
  });

  // Downstream aliases for remaining seed records
  const admin = nifal;
  const manager = binshi;
  const financeManager = binshi;
  const hrManager = binshi;
  const engineer = shamil;

  const clientPortalUser = await prisma.user.create({
    data: {
      email: "client@acme.com",
      passwordHash,
      firstName: "Nina",
      lastName: "Shah",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: {
        create: [{ roleId: clientRole.id }],
      },
    },
  });

  const client = await prisma.client.create({
    data: {
      companyName: "Acme Health Labs",
      contactPerson: "Nina Shah",
      email: "client@acme.com",
      phone: "+91-9999999999",
      address: "Bengaluru, India",
      website: "https://acmehealthlabs.example",
      notes: "Strategic AI delivery client.",
      portalUserId: clientPortalUser.id,
      contracts: {
        create: {
          title: "AI Automation Master Services Agreement",
          startDate: new Date("2025-01-01"),
          value: 350000,
          status: "Active",
        },
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Conversational Care Assistant",
      clientId: client.id,
      description: "Internal patient support workflow platform with AI copilots.",
      startDate: new Date("2025-02-01"),
      endDate: new Date("2025-08-30"),
      budget: 225000,
      status: ProjectStatus.ACTIVE,
      managerId: manager.id,
      members: {
        create: [
          {
            userId: manager.id,
            roleLabel: "Project Manager",
            allocation: 40,
          },
          {
            userId: engineer.id,
            roleLabel: "AI Engineer",
            allocation: 80,
          },
        ],
      },
      milestones: {
        create: [
          {
            title: "Discovery and solution design",
            description: "Workshops, backlog, and architecture signoff.",
            dueDate: new Date("2025-03-10"),
          },
          {
            title: "MVP release",
            description: "Client dashboard, workflow automations, and reporting.",
            dueDate: new Date("2025-06-15"),
            status: MilestoneStatus.IN_PROGRESS,
          },
        ],
      },
    },
  });

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: "Build AI triage workflow",
      description: "Create the orchestration pipeline and escalation dashboard.",
      assignedToId: engineer.id,
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: new Date("2025-05-12"),
      estimatedHrs: 32,
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorId: manager.id,
      content: "Keep the workflow event-driven so ops can extend it later.",
    },
  });

  await prisma.timeEntry.create({
    data: {
      userId: engineer.id,
      projectId: project.id,
      taskId: task.id,
      startTime: new Date("2025-04-10T04:00:00.000Z"),
      endTime: new Date("2025-04-10T08:30:00.000Z"),
      duration: 270,
      notes: "Integrated vector retrieval and escalation routing.",
    },
  });

  await prisma.attendance.create({
    data: {
      userId: engineer.id,
      date: new Date("2025-04-10"),
      checkIn: new Date("2025-04-10T03:30:00.000Z"),
      checkOut: new Date("2025-04-10T12:30:00.000Z"),
      totalHours: 9,
    },
  });

  await prisma.leaveBalance.createMany({
    data: [
      { userId: engineer.id, leaveType: LeaveType.ANNUAL, totalDays: 18, usedDays: 3, remaining: 15 },
      { userId: engineer.id, leaveType: LeaveType.SICK, totalDays: 8, usedDays: 1, remaining: 7 },
      { userId: engineer.id, leaveType: LeaveType.CASUAL, totalDays: 6, usedDays: 0, remaining: 6 },
    ],
  });

  await prisma.leaveRequest.create({
    data: {
      userId: engineer.id,
      leaveType: LeaveType.ANNUAL,
      startDate: new Date("2025-05-20"),
      endDate: new Date("2025-05-22"),
      status: LeaveStatus.APPROVED,
      approvedById: admin.id,
      reason: "Family travel",
    },
  });

  await prisma.resourceAllocation.create({
    data: {
      userId: engineer.id,
      projectId: project.id,
      allocatedHours: 120,
      roleLabel: "AI Engineer",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-06-30"),
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2025-0001",
      clientId: client.id,
      projectId: project.id,
      amount: 75000,
      tax: 13500,
      total: 88500,
      status: InvoiceStatus.SENT,
      dueDate: new Date("2025-05-05"),
      createdById: financeManager.id,
      items: {
        create: [
          {
            description: "AI workflow design and implementation sprint",
            quantity: 1,
            price: 75000,
            total: 75000,
          },
        ],
      },
    },
  });

  const revenue = await prisma.revenue.create({
    data: {
      title: "Milestone payment from Acme Health Labs",
      source: "Client Payment",
      amount: 88500,
      receivedAt: new Date("2025-04-20"),
      createdById: financeManager.id,
    },
  });

  await prisma.transaction.create({
    data: {
      type: TransactionType.REVENUE,
      amount: 88500,
      reference: invoice.invoiceNumber,
      revenueId: revenue.id,
      createdById: financeManager.id,
    },
  });

  const expense = await prisma.expense.create({
    data: {
      title: "AWS model inference spend",
      category: "Cloud",
      amount: 18500,
      spentAt: new Date("2025-04-18"),
      createdById: financeManager.id,
      notes: "Inference and vector indexing cost for project workloads.",
    },
  });

  await prisma.transaction.create({
    data: {
      type: TransactionType.EXPENSE,
      amount: 18500,
      reference: "AWS-APR-2025",
      expenseId: expense.id,
      createdById: financeManager.id,
    },
  });

  await prisma.proposal.create({
    data: {
      clientId: client.id,
      projectId: project.id,
      projectName: "Expansion Phase",
      description: "Proposal for multilingual support and analytics automation.",
      timeline: "12 weeks",
      pricing: "INR 14,00,000",
      status: ProposalStatus.SENT,
      createdById: manager.id,
      blocks: {
        create: [
          {
            heading: "Objectives",
            content: "Extend the assistant into multilingual workflows and leadership reporting.",
            sortOrder: 1,
          },
          {
            heading: "Delivery model",
            content: "Dedicated pod with PM, AI engineer, and frontend engineer.",
            sortOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.document.create({
    data: {
      fileUrl: "/uploads/contracts/acme-msa-v1.pdf",
      fileName: "acme-msa-v1.pdf",
      entityType: DocumentEntityType.CLIENT,
      clientId: client.id,
      uploadedById: admin.id,
      mimeType: "application/pdf",
      sizeInBytes: 184000,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        title: "Invoice sent",
        body: "INV-2025-0001 was sent to Acme Health Labs.",
        actionUrl: `/finance?invoice=${invoice.id}`,
      },
      {
        userId: engineer.id,
        title: "Task updated",
        body: "Build AI triage workflow is due on May 12.",
        actionUrl: `/tasks?task=${task.id}`,
      },
    ],
  });

  console.log(`Seeded ${permissions.length} permissions, ${roles.length} roles, and demo ERP data.`);

  // ── HR foundation seed enrichment ──
  const managerUser = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: RoleCode.PROJECT_MANAGER } } } },
    select: { id: true },
  });
  const reportProfile = await prisma.employeeProfile.findFirst({
    where: { managerId: null, user: { id: { not: managerUser?.id } } },
    select: { id: true, userId: true },
  });
  if (managerUser && reportProfile) {
    await prisma.employeeProfile.update({
      where: { id: reportProfile.id },
      data: { managerId: managerUser.id },
    });
  }

  const hrAuthor = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: RoleCode.HR_MANAGER } } } },
    select: { id: true },
  });
  if (hrAuthor && reportProfile) {
    const existingNote = await prisma.hrNote.findFirst({
      where: { employeeId: reportProfile.id, body: "Initial HR note seeded for development testing." },
      select: { id: true },
    });
    if (!existingNote) {
      await prisma.hrNote.create({
        data: {
          employeeId: reportProfile.id,
          authorId: hrAuthor.id,
          category: "GENERAL",
          body: "Initial HR note seeded for development testing.",
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
