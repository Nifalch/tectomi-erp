import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { resolveScopedUserId } from "../../common/scope/resolve-scope.util";
import { CreateLeaveRequestDto, UpdateLeaveStatusDto } from "./dto/create-leave-request.dto";
import { LeaveService } from "./leave.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("leave")
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  list(
    @CurrentUser() user: { id: string; roles?: any },
    @Query("userId") userId?: string,
  ) {
    const scopedId = resolveScopedUserId(user, userId);
    return this.leaveService.list(scopedId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get("all")
  listAll() {
    return this.leaveService.listAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("balances")
  balances(
    @CurrentUser() user: { id: string; roles?: any },
    @Query("userId") userId?: string,
  ) {
    const scopedId = resolveScopedUserId(user, userId);
    return this.leaveService.balances(scopedId);
  }

  // Monthly paid-leave usage (used / cap / remaining) for the scoped user.
  // Separate from /balances to avoid changing the existing array shape.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get("monthly-usage")
  monthlyUsage(
    @CurrentUser() user: { id: string; roles?: any },
    @Query("userId") userId?: string,
  ) {
    const scopedId = resolveScopedUserId(user, userId);
    return this.leaveService.monthlyUsage(scopedId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateLeaveStatusDto,
  ) {
    return this.leaveService.updateStatus(id, user.id, dto);
  }
}
