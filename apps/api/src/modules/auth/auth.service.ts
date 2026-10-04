import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { RoleCode, UserStatus } from "@prisma/client";
import type { StringValue } from "ms";
import { randomBytes, createHash } from "node:crypto";
import { env } from "../../config/env";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MailService } from "../../common/mail/mail.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { LogoutDto, RefreshTokenDto } from "./dto/refresh-token.dto";
import { RequestPasswordResetDto, ResetPasswordDto } from "./dto/password-reset.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { hashPassword, verifyPassword } from "./password.util";

/**
 * Parse a JWT-style TTL string ("15m", "7d", "2h", "30s", or a raw number
 * of seconds) to milliseconds. Mirrors the subset of jsonwebtoken / ms
 * formats actually used in env. Throws on unparseable values so a typo
 * doesn't silently fall back to a 0-second token.
 */
function parseTtlMs(ttl: string): number {
  const trimmed = ttl.trim();
  const m = trimmed.match(/^(\d+)\s*(ms|s|m|h|d|w)?$/i);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return n * factors[unit];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new BadRequestException("User already exists.");
    }

    const roles = await this.prisma.role.findMany({
      where: {
        code: {
          in: dto.roles,
        },
      },
    });

    if (roles.length !== dto.roles.length) {
      throw new BadRequestException("One or more roles are invalid.");
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashPassword(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: UserStatus.ACTIVE,
        roles: {
          create: roles.map((role) => ({
            roleId: role.id,
          })),
        },
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.issueVerification(user.id, user.email, `${user.firstName} ${user.lastName}`);
    return this.issueTokens(user, dto.roles);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    // Block login for deactivated accounts. Terminated employees have their
    // status flipped to INACTIVE by the HR termination flow; SUSPENDED is
    // for admin-initiated lock-outs. INVITED is allowed so a freshly invited
    // user can complete onboarding by signing in.
    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        user.status === UserStatus.INACTIVE
          ? "This account has been deactivated. Contact your administrator."
          : "This account is currently suspended.",
      );
    }

    const roleCodes = user.roles.map((entry) => entry.role.code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, roleCodes);
  }

  async refresh(dto: RefreshTokenDto) {
    const hashed = createHash("sha256").update(dto.refreshToken).digest("hex");
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashed },
      include: {
        user: {
          include: {
            roles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (!token || token.revokedAt || token.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is invalid or expired.");
    }

    // Block refresh for deactivated accounts too — otherwise a terminated
    // employee whose access token has expired would silently get a fresh
    // one until their refresh token expires (often days/weeks).
    if (
      token.user.status === UserStatus.INACTIVE ||
      token.user.status === UserStatus.SUSPENDED
    ) {
      // Revoke the token so subsequent refreshes also fail.
      await this.prisma.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Account is no longer active.");
    }

    const roles = token.user.roles.map((entry) => entry.role.code);
    return this.issueTokens(token.user, roles);
  }

  async logout(dto: LogoutDto) {
    const hashed = createHash("sha256").update(dto.refreshToken).digest("hex");
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashed,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        employeeProfile: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      return { success: true };
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    await this.mailService.sendTemplateEmail(user.email, "Reset your password", {
      resetUrl: `${env.appUrl}/reset-password?token=${rawToken}`,
    });

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    const now = new Date();
    // Atomically mark the token used. If two concurrent requests race the
    // same token, only one updateMany will affect a row (the WHERE clause
    // requires `usedAt: null`); the other gets count: 0 and is rejected.
    const claim = await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException("Reset token is invalid or expired.");
    }
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!token) {
      throw new UnauthorizedException("Reset token is invalid or expired.");
    }
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: hashPassword(dto.newPassword) },
    });
    // Revoke any active refresh tokens so a leaked credential can't
    // outlive the reset.
    await this.prisma.refreshToken.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { success: true };
  }

  /**
   * Self-serve change password for a logged-in user. Verifies the current
   * password (so a stolen JWT alone can't rotate the password) and revokes
   * other refresh-tokens to force re-auth on other devices.
   */
  async changeOwnPassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException("User not found.");
    const ok = verifyPassword(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Current password is incorrect.");
    }
    if (verifyPassword(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException("New password must be different from the current one.");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(dto.newPassword) },
    });
    // Invalidate other sessions so a leaked credential can't outlive the change.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async verifyEmail(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const verification = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (!verification || verification.expiresAt < new Date() || verification.consumedAt) {
      throw new UnauthorizedException("Verification token is invalid or expired.");
    }

    await this.prisma.user.update({
      where: { id: verification.userId },
      data: {
        emailVerifiedAt: new Date(),
      },
    });

    await this.prisma.verificationToken.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });

    return { success: true };
  }

  private async issueVerification(userId: string, email: string, name: string) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    await this.mailService.sendTemplateEmail(email, "Verify your email", {
      name,
      verifyUrl: `${env.appUrl}/verify-email?token=${rawToken}`,
    });
  }

  async impersonate(targetUserId: string, actorUserId: string) {
    if (targetUserId === actorUserId) {
      throw new BadRequestException("You are already logged in as this user.");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException("Target user not found.");
    if (target.status === UserStatus.INACTIVE || target.status === UserStatus.SUSPENDED) {
      throw new BadRequestException(
        "Cannot impersonate a deactivated or suspended user.",
      );
    }

    // Audit trail — every impersonation issuance is logged so a stolen
    // SUPER_ADMIN session can't quietly assume another identity.
    // eslint-disable-next-line no-console
    console.warn(
      `[AUDIT] impersonation actor=${actorUserId} target=${targetUserId} at=${new Date().toISOString()}`,
    );

    const roleCodes = target.roles.map((entry) => entry.role.code);
    return this.issueTokens(target, roleCodes);
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      avatarUrl?: string | null;
    },
    roles: RoleCode[],
  ) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: env.jwtAccessSecret,
      expiresIn: env.jwtAccessTtl as StringValue,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: env.jwtRefreshSecret,
      expiresIn: env.jwtRefreshTtl as StringValue,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        // Mirror the JWT TTL exactly so a refresh-token row never outlives
        // (or under-lives) the JWT it represents.
        expiresAt: new Date(Date.now() + parseTtlMs(env.jwtRefreshTtl)),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        avatarUrl: user.avatarUrl ?? null,
        roles,
      },
    };
  }
}
