import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType, Prisma, RoleCode, UserStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaginationDto, getPagination } from "../../common/pagination/pagination.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ResetUserPasswordDto, SetUserRolesDto, UpdateUserDto } from "./dto/update-user.dto";
import { hashPassword } from "../auth/password.util";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: PaginationDto,
    opts: { includeInactive?: boolean; includeClients?: boolean } = {},
  ) {
    const { skip, take, page, pageSize } = getPagination(query);
    const searchWhere: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" as const } },
            { lastName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};
    // Default: only ACTIVE/INVITED users (i.e. those who can or will be
    // able to log in). Callers that need to see deactivated accounts —
    // e.g. the Settings → Users admin panel — pass includeInactive=true.
    const statusWhere: Prisma.UserWhereInput = opts.includeInactive
      ? {}
      : { status: { in: [UserStatus.ACTIVE, UserStatus.INVITED] } };
    // Default: exclude users whose ONLY role is CLIENT (i.e. portal-only
    // accounts). Staff pickers — project members, task assignees, founder
    // picker, chat invites — should never surface clients. Admin views
    // that manage portal accounts directly pass includeClients=true.
    const clientWhere: Prisma.UserWhereInput = opts.includeClients
      ? {}
      : { roles: { none: { role: { code: RoleCode.CLIENT } } } };
    const where: Prisma.UserWhereInput = { ...searchWhere, ...statusWhere, ...clientWhere };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          employeeProfile: true,
          roles: { include: { role: true } },
        },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException("User with this email already exists.");

    const roles = await this.prisma.role.findMany({
      where: { code: { in: dto.roles } },
    });

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashPassword(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: UserStatus.ACTIVE,
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
        employeeProfile: dto.department || dto.designation
          ? {
              create: {
                department: dto.department ?? "General",
                designation: dto.designation ?? "Team Member",
                salary: 0,
                joinDate: new Date(),
                employmentType: dto.employmentType ?? EmploymentType.FULL_TIME,
              },
            }
          : undefined,
      },
      include: {
        employeeProfile: true,
        roles: { include: { role: true } },
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employeeProfile: {
          include: {
            promotions: true,
            documents: true,
          },
        },
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found.");

    if (dto.email && dto.email !== user.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (clash) throw new BadRequestException("Email already in use.");
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: dto.status,
        avatarUrl: dto.avatarUrl,
      },
      include: {
        employeeProfile: true,
        roles: { include: { role: true } },
      },
    });
  }

  async setRoles(id: string, dto: SetUserRolesDto, actorId: string) {
    if (id === actorId && !dto.roles.includes(RoleCode.SUPER_ADMIN)) {
      // Prevent super admin from removing their own SUPER_ADMIN role
      throw new ForbiddenException("You cannot remove SUPER_ADMIN from your own account.");
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found.");

    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException("One or more roles are invalid.");
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      }),
    ]);

    return this.findOne(id);
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found.");

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(dto.newPassword) },
    });

    // Revoke all active refresh tokens to force re-login
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new ForbiddenException("You cannot delete your own account.");
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found.");

    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
