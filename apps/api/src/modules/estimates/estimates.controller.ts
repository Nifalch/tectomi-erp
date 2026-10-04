import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateEstimateDto, UpdateEstimateDto } from "./dto/estimate.dto";
import { EstimatesService } from "./estimates.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("estimates")
export class EstimatesController {
  constructor(private readonly service: EstimatesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER, RoleCode.CLIENT)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER, RoleCode.CLIENT)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateEstimateDto) {
    return this.service.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateEstimateDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/send")
  send(@Param("id") id: string) {
    return this.service.send(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/accept")
  accept(@Param("id") id: string) {
    return this.service.accept(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/decline")
  decline(@Param("id") id: string) {
    return this.service.decline(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post(":id/convert-to-invoice")
  convert(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.service.convertToInvoice(id, user.id);
  }
}
