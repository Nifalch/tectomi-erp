import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateProjectExpenseDto } from "./dto/create-project-expense.dto";
import { UpdateProjectExpenseDto } from "./dto/update-project-expense.dto";
import { ProjectExpensesService } from "./project-expenses.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("project-expenses")
export class ProjectExpensesController {
  constructor(private readonly service: ProjectExpensesService) {}

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get()
  findAll(@Query("projectId") projectId?: string) {
    return this.service.findAll(projectId);
  }

  // Declare BEFORE `:id` to avoid Nest treating "summary" as an id.
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get("summary/:projectId")
  summary(@Param("projectId") projectId: string) {
    return this.service.summary(projectId);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Post()
  create(
    @Body() dto: CreateProjectExpenseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(dto, user.id);
  }

  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.ADMIN,
    RoleCode.PROJECT_MANAGER,
    RoleCode.FINANCE_MANAGER,
  )
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectExpenseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.service.remove(id, user.id);
  }
}
