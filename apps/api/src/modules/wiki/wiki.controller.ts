import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WikiService } from "./wiki.service";

interface CreateWikiBody {
  projectId: string;
  title: string;
  content: string;
  parentId?: string;
}

interface UpdateWikiBody {
  title?: string;
  content?: string;
  parentId?: string;
  sortOrder?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("wiki")
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get()
  findAll(@Query("projectId") projectId: string) {
    return this.wikiService.findAll(projectId);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.EMPLOYEE,
    RoleCode.CLIENT,
    RoleCode.FINANCE_MANAGER,
    RoleCode.HR_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.wikiService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Post()
  create(@Body() dto: CreateWikiBody, @CurrentUser() user: { id: string }) {
    return this.wikiService.create(dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateWikiBody) {
    return this.wikiService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.wikiService.remove(id);
  }
}
