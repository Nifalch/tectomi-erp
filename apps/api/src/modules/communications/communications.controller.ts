import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CommunicationsService } from "./communications.service";
import { CreateCommunicationDto } from "./dto/create-communication.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Get()
  findAll(@Query("clientId") clientId?: string, @Query("leadId") leadId?: string) {
    return this.communicationsService.findAll(clientId, leadId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateCommunicationDto) {
    return this.communicationsService.create(user.id, dto);
  }
}
