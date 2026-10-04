import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsEnum, IsString, MinLength } from "class-validator";
import type { Request } from "express";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { StaffRequestsService } from "./staff-requests.service";

class ReplyDto {
  @IsString() @MinLength(1) body!: string;
}
class StatusDto {
  @IsEnum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status!: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
}
class LinkDto {
  @IsString() taskId!: string;
}

@Controller("client-requests")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
export class StaffRequestsController {
  constructor(private readonly svc: StaffRequestsService) {}

  @Get()
  list(@Query("clientId") clientId: string) {
    return this.svc.list(clientId);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.svc.detail(id);
  }

  @Post(":id/messages")
  reply(@Param("id") id: string, @Body() dto: ReplyDto, @Req() req: any) {
    return this.svc.reply(id, req.user.id, dto.body);
  }

  @Patch(":id/status")
  setStatus(@Param("id") id: string, @Body() dto: StatusDto) {
    return this.svc.setStatus(id, dto.status);
  }

  @Patch(":id/linked-task")
  linkTask(@Param("id") id: string, @Body() dto: LinkDto) {
    return this.svc.linkTask(id, dto.taskId);
  }
}
