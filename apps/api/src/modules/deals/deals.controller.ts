import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { DealsService } from "./deals.service";
import { ConvertFromLeadDto, CreateDealDto, ListDealsDto, UpdateDealDto } from "./dto/deal.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("deals")
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get()
  findAll(@Query() query: ListDealsDto) {
    return this.dealsService.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.dealsService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateDealDto) {
    return this.dealsService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDealDto) {
    return this.dealsService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.dealsService.remove(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post(":id/convert-from-lead")
  convertFromLead(@Param("id") _id: string, @Body() dto: ConvertFromLeadDto) {
    return this.dealsService.convertFromLead(dto.leadId);
  }
}
