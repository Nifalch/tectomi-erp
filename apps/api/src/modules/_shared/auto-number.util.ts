import { PrismaService } from "../../common/prisma/prisma.service";

export async function nextNumber(
  prisma: PrismaService,
  model: "estimate" | "bill" | "payment" | "journalEntry" | "creditNote",
  prefix: string,
): Promise<string> {
  const count = await (prisma as any)[model].count();
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}
