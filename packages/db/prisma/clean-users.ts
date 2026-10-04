/**
 * One-shot account cleanup:
 *   1. Renames admin@nuro7.com → "Muhammed Nifal C H" with a new password
 *      hashed the same way as seed.ts (scrypt + random 16-byte salt).
 *   2. Deletes every other demo user (pm/finance/hr/engineer + the
 *      client@acme.com portal user) along with their UserRole rows,
 *      EmployeeProfile rows, refresh tokens, etc.
 *
 * Safe to re-run — looks up by email and no-ops if a row is already gone.
 *
 * Run:  npx tsx prisma/clean-users.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// Matches seed.ts hashing exactly. Format: "<saltHex>:<derivedHex>".
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const ADMIN_EMAIL = "admin@nuro7.com";
const ADMIN_NEW_PASSWORD = "Nuro@2026";
const ADMIN_FIRST = "Muhammed";
const ADMIN_LAST = "Nifal C H";

const EMAILS_TO_DELETE = [
  "pm@nuro7.com",
  "finance@nuro7.com",
  "hr@nuro7.com",
  "engineer@nuro7.com",
  "client@acme.com",
];

async function main() {
  // 1. Rename + repassword the admin.
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    throw new Error(`Admin user ${ADMIN_EMAIL} not found — re-run the seed first.`);
  }
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      firstName: ADMIN_FIRST,
      lastName: ADMIN_LAST,
      passwordHash: hashPassword(ADMIN_NEW_PASSWORD),
    },
  });
  // Kill any open refresh tokens so old sessions can't keep working with
  // the old password — they'll be forced to re-login with the new one.
  await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
  console.log(`Renamed ${ADMIN_EMAIL} → "${ADMIN_FIRST} ${ADMIN_LAST}" + new password set.`);

  // 2. Delete the other demo users. We clear dependent rows first so the
  //    cascade doesn't trip on tables without `onDelete: Cascade`.
  for (const email of EMAILS_TO_DELETE) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      console.log(`  ${email} — already gone, skipping.`);
      continue;
    }
    // Dependent rows the schema doesn't auto-cascade for some User FKs.
    await prisma.userRole.deleteMany({ where: { userId: u.id } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: u.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: u.id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: u.id } });
    await prisma.verificationToken.deleteMany({ where: { userId: u.id } });
    await prisma.savedView.deleteMany({ where: { userId: u.id } });
    await prisma.notification.deleteMany({ where: { userId: u.id } });
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await prisma.employeeProfile.deleteMany({ where: { userId: u.id } });
    // Finally the user row itself.
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  Deleted ${email}`);
  }

  const remaining = await prisma.user.findMany({
    select: { email: true, firstName: true, lastName: true },
  });
  console.log("\nRemaining users:");
  for (const u of remaining) {
    console.log(`  ${u.email} — ${u.firstName} ${u.lastName}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
