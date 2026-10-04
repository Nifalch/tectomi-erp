import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { PortalProjectsService } from "../../src/modules/client-portal/projects/portal-projects.service";

describe("Portal projects isolation", () => {
  let svc: PortalProjectsService;
  // PortalProjectsService now enriches list / detail with task + time +
  // milestone + invoice rollups. Stub every method the service touches so
  // the security-invariant assertions (where: { clientId }) still execute
  // without falling over on missing prisma methods downstream.
  const prismaMock: any = {
    project: { findMany: jest.fn(), findFirst: jest.fn() },
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    timeEntry: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { duration: null } }),
    },
    milestone: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: null }, _count: 0 }),
    },
    paymentMilestone: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-seed the default-empty resolutions (clearAllMocks wipes them).
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.groupBy.mockResolvedValue([]);
    prismaMock.timeEntry.groupBy.mockResolvedValue([]);
    prismaMock.timeEntry.aggregate.mockResolvedValue({ _sum: { duration: null } });
    prismaMock.milestone.groupBy.mockResolvedValue([]);
    prismaMock.milestone.findMany.mockResolvedValue([]);
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });
    prismaMock.paymentMilestone.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);
    const mod = await Test.createTestingModule({
      providers: [
        PortalProjectsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    svc = mod.get(PortalProjectsService);
  });

  it("list filters by clientId", async () => {
    prismaMock.project.findMany.mockResolvedValue([]);
    await svc.list("client-A");
    // Security invariant: the top-level project query MUST filter by the
    // authenticated client's id — otherwise the portal would leak across
    // tenants. The downstream stat queries are scoped via projectIds derived
    // from this result, so guarding this one query is enough.
    expect(prismaMock.project.findMany.mock.calls[0][0].where).toMatchObject({ clientId: "client-A" });
  });

  it("detail throws NotFound on cross-client id", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    await expect(svc.detail("client-A", "project-of-B")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("detail guards by { id, clientId } before returning anything", async () => {
    // The detail payload now bundles milestones, payment cycle, invoices,
    // team, hours, etc. — the test only needs to verify the security
    // invariant (project lookup is scoped to the client). Stub the project
    // shape with everything the downstream code .map()s over so the call
    // doesn't blow up on missing arrays.
    prismaMock.project.findFirst.mockResolvedValue({
      id: "p1",
      name: "P1",
      status: "ACTIVE",
      description: null,
      startDate: new Date(),
      endDate: null,
      clientId: "client-A",
      budget: 0,
      milestones: [],
      paymentMilestones: [],
      _count: { tasks: 0 },
    });
    await svc.detail("client-A", "p1");
    expect(prismaMock.project.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "p1",
      clientId: "client-A",
    });
  });

  it("tasks check project ownership before listing", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ id: "p1", clientId: "client-A" });
    await svc.tasks("client-A", "p1");
    // Security invariant: tasks endpoint MUST guard via a project lookup
    // that includes the client's id. Without that, a client could swap
    // the projectId in the URL and read another client's tasks. The
    // `isClientVisible` filter was intentionally removed (see service
    // comment) because new tasks default to false and were producing
    // empty Tasks tabs — isolation still holds via the ownership check.
    expect(prismaMock.project.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "p1",
      clientId: "client-A",
    });
    expect(prismaMock.task.findMany.mock.calls[0][0].where).toMatchObject({
      projectId: "p1",
    });
  });

  it("tasks throws NotFound when project belongs to a different client", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    await expect(svc.tasks("client-A", "project-of-B")).rejects.toBeInstanceOf(NotFoundException);
  });
});
