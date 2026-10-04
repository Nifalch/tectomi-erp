import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SetUserAccessDto } from "./dto/user-access.dto";

/**
 * Per-user module access. Stores GRANT / DENY overrides; the role-based
 * baseline and the final "effective access" calculation live on the
 * frontend (which already has the navigationItems list from the contracts
 * package). Keeping the contracts import out of the API avoids dragging
 * the cross-package source into the compiled `dist/` tree.
 */
@Injectable()
export class UserAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async listOverrides(userId: string) {
    await this.assertUserExists(userId);
    return this.prisma.userModuleAccess.findMany({
      where: { userId },
      orderBy: { moduleKey: "asc" },
      include: {
        grantedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  /**
   * Bootstrap call. Returns the override rows plus the user's role codes so
   * the frontend can compute "what should the sidebar show?" without a
   * second roundtrip. The frontend then unions role-defaults (from
   * navigationItems) with these overrides.
   */
  async myAccessSnapshot(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException("User not found");
    const overrides = await this.prisma.userModuleAccess.findMany({
      where: { userId },
      select: { moduleKey: true, override: true },
    });
    return {
      roles: user.roles.map((r) => r.role.code),
      overrides,
    };
  }

  async setOverride(actorId: string, userId: string, dto: SetUserAccessDto) {
    await this.assertUserExists(userId);
    return this.prisma.userModuleAccess.upsert({
      where: { userId_moduleKey: { userId, moduleKey: dto.moduleKey } },
      create: {
        userId,
        moduleKey: dto.moduleKey,
        override: dto.override,
        grantedById: actorId,
        note: dto.note,
      },
      update: {
        override: dto.override,
        grantedById: actorId,
        note: dto.note,
      },
    });
  }

  async clearOverride(userId: string, moduleKey: string) {
    try {
      await this.prisma.userModuleAccess.delete({
        where: { userId_moduleKey: { userId, moduleKey } },
      });
    } catch {
      // Idempotent — clearing something that doesn't exist is fine.
    }
    return { success: true };
  }

  /**
   * Admin view: returns the target user's roles + their overrides. The
   * frontend renders the full module matrix by combining this with
   * navigationItems.
   */
  async listForAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException("User not found");
    const overrides = await this.prisma.userModuleAccess.findMany({
      where: { userId },
      include: {
        grantedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return {
      roles: user.roles.map((r) => r.role.code),
      overrides,
    };
  }

  private async assertUserExists(userId: string) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException("User not found");
  }
}
