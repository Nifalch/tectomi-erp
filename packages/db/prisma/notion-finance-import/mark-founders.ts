/**
 * One-shot: mark the 3 seeded co-founder employee profiles as founders.
 * Required for the founder dashboard, capital-account ledger, and the
 * "Drawn" / "Deferred" pay-slip controls to show up in the UI.
 *
 * Matches by the seed's canonical full names so it's safe to re-run on a
 * freshly seeded DB.
 *
 * Run:  npx tsx prisma/notion-finance-import/mark-founders.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FOUNDER_FULLNAMES = [
  // Match seed.ts firstName+lastName concatenations.
  ["Muhammed", "Nifal C H"],
  ["Muhammed", "Nifli"],
  ["Minhaj", "Khan"],
] as const;

async function main() {
  // Pull every EmployeeProfile + the associated user, then mark the
  // ones whose names match the founders. We look up by (firstName,
  // lastName) instead of email because demo emails may have been
  // renamed in your install.
  const profiles = await prisma.employeeProfile.findMany({
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  let flipped = 0;
  let alreadyOn = 0;
  for (const p of profiles) {
    const fn = p.user.firstName ?? "";
    const ln = p.user.lastName ?? "";
    const isFounder = FOUNDER_FULLNAMES.some(([f, l]) => f === fn && l === ln);
    if (!isFounder) continue;
    if (p.isFounder) {
      alreadyOn++;
      console.log(`  - ${fn} ${ln} (${p.user.email}) — already flagged`);
      continue;
    }
    await prisma.employeeProfile.update({
      where: { id: p.id },
      data: { isFounder: true },
    });
    flipped++;
    console.log(`  ✓ ${fn} ${ln} (${p.user.email}) — isFounder set`);
  }

  console.log(`\nResult: ${flipped} flipped, ${alreadyOn} already on`);
  if (flipped === 0 && alreadyOn === 0) {
    console.log("No founder profiles matched the expected names — check the FOUNDER_FULLNAMES list at the top of this script.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
