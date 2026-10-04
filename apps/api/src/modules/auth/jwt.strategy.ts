import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { RoleCode, UserStatus } from "@prisma/client";
import { ExtractJwt, Strategy } from "passport-jwt";
import { env } from "../../config/env";
import { PrismaService } from "../../common/prisma/prisma.service";

type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
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

    // Reject tokens whose owner no longer exists or has been deactivated.
    // This kicks in immediately at termination — without it, a terminated
    // employee could continue using their already-issued access token
    // until it expires (~15 min default).
    if (!user || user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException("Account is no longer active.");
    }

    return {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      roles: user.roles.map((entry) => entry.role.code as RoleCode),
      permissions: user.roles.flatMap((entry) =>
        entry.role.permissions.map(
          (permission) => `${permission.permission.resource}:${permission.permission.action.toLowerCase()}`,
        ),
      ),
    };
  }
}

