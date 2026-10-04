import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RoleCode } from "@prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateArticleDto } from "./dto/create-article.dto";
import { KnowledgeService } from "./knowledge.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.knowledgeService.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.knowledgeService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateArticleDto) {
    return this.knowledgeService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateArticleDto>) {
    return this.knowledgeService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.knowledgeService.remove(id);
  }
}
