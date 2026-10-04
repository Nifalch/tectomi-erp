import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleCode } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { roles?: RoleCode[] } | undefined;

    // SUPER_ADMIN always has access to every endpoint regardless of the
    // specific roles a handler requires.
    if (user?.roles?.includes(RoleCode.SUPER_ADMIN)) return true;

    return requiredRoles.some((role) => user?.roles?.includes(role));
  }
}

