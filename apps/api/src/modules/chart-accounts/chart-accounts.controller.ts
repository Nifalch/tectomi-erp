import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ChartAccountsService } from "./chart-accounts.service";
import { CreateChartAccountDto, UpdateChartAccountDto } from "./dto/chart-account.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("chart-accounts")
export class ChartAccountsController {
  constructor(private readonly service: ChartAccountsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get("tree")
  tree() {
    return this.service.tree();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post("seed-defaults")
  seedDefaults() {
    return this.service.seedDefaults();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@Body() dto: CreateChartAccountDto) {
    return this.service.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateChartAccountDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
