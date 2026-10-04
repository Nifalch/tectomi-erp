/**
 * One-shot: wipe every Attendance row. Safe to re-run.
 *
 * Run:  npx tsx prisma/notion-finance-import/clear-attendance.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.attendance.count();
  console.log(`Before: ${before} attendance row${before === 1 ? "" : "s"}`);
  await prisma.attendance.deleteMany();
  const after = await prisma.attendance.count();
  console.log(`After:  ${after} attendance row${after === 1 ? "" : "s"}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
