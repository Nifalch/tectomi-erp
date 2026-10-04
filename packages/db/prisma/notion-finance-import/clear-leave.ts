/**
 * One-shot: wipe every leave record (LeaveRequest + LeaveBalance) so the
 * Leave Summary page shows zero rows for everyone. Also recomputes each
 * employee's performance score since unpaid-leave days feed into it.
 *
 * Safe to re-run — uses deleteMany so an already-empty table no-ops.
 *
 * Run:  npx tsx prisma/notion-finance-import/clear-leave.ts
 */

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await Promise.all([
    prisma.leaveRequest.count(),
    prisma.leaveBalance.count(),
  ]);
  console.log(`Before: ${before[0]} leave requests · ${before[1]} leave balances`);

  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();

  // Drop the unpaid-leave penalty from each employee's performanceScore.
  // The rollup helper expects no recent unpaid leave now, so anyone who
  // had a penalty applied will see their score float back up. We do this
  // inline rather than calling the service to keep the script
  // self-contained (no Nest DI).
  const profiles = await prisma.employeeProfile.findMany({
    where: { performanceScore: { not: null } },
    select: { userId: true },
  });
  for (const p of profiles) {
    const recent = await prisma.performanceReview.findMany({
      where: { employeeId: p.userId, status: "COMPLETED", finalRating: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 4,
      select: { finalRating: true },
    });
    if (recent.length === 0) continue;
    const base = recent.reduce((s, r) => s + Number(r.finalRating ?? 0), 0) / recent.length;
    // No unpaid leave → no penalty.
    const score = Math.max(0, Math.min(5, base));
    await prisma.employeeProfile.updateMany({
      where: { userId: p.userId },
      data: { performanceScore: new Prisma.Decimal(score.toFixed(2)) },
    });
  }

  const after = await Promise.all([
    prisma.leaveRequest.count(),
    prisma.leaveBalance.count(),
  ]);
  console.log(`After:  ${after[0]} leave requests · ${after[1]} leave balances`);
  console.log(`Rolled up ${profiles.length} performance score${profiles.length === 1 ? "" : "s"} (removed unpaid-leave penalties).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
