import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CustomFieldsService, CreateCustomFieldDto } from "./custom-fields.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  // Everyone authenticated can read the custom-field schema (needed to render forms).
  @Get()
  list(@Query("entity") entity?: string) {
    return this.service.list(entity);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post()
  create(@Body() dto: CreateCustomFieldDto) {
    return this.service.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateCustomFieldDto>) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
