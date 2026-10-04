import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateItemDto, UpdateItemDto } from "./dto/item.dto";
import { ItemsService } from "./items.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("items")
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.service.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
