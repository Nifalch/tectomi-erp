import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateResourceAllocationDto } from "./dto/create-resource-allocation.dto";
import { ResourcesService } from "./resources.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("resources")
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Get()
  list() {
    return this.resourcesService.list();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@Body() dto: CreateResourceAllocationDto) {
    return this.resourcesService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateResourceAllocationDto>) {
    return this.resourcesService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.resourcesService.remove(id);
  }
}
