import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateHolidayDto } from "./dto/create-holiday.dto";
import { HolidaysService } from "./holidays.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("holidays")
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get()
  findAll() {
    return this.holidaysService.findAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post()
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateHolidayDto>) {
    return this.holidaysService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.holidaysService.remove(id);
  }
}
