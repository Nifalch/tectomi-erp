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
import { MarketingIdeasService } from "./marketing-ideas.service";
import {
  CreateMarketingIdeaDto,
  CreateMarketingIdeaTaskDto,
  ListMarketingIdeasQueryDto,
  UpdateMarketingIdeaDto,
  UpdateMarketingIdeaTaskDto,
} from "./dto/marketing-idea.dto";

const STUDIO_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("marketing-ideas")
@Roles(...STUDIO_ROLES)
export class MarketingIdeasController {
  constructor(private readonly svc: MarketingIdeasService) {}

  @Get()
  list(@Query() query: ListMarketingIdeasQueryDto) {
    return this.svc.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateMarketingIdeaDto) {
    return this.svc.create(user.id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMarketingIdeaDto) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post(":id/tasks")
  addTask(@Param("id") id: string, @Body() dto: CreateMarketingIdeaTaskDto) {
    return this.svc.addTask(id, dto);
  }

  @Patch("tasks/:taskId")
  updateTask(@Param("taskId") taskId: string, @Body() dto: UpdateMarketingIdeaTaskDto) {
    return this.svc.updateTask(taskId, dto);
  }

  @Delete("tasks/:taskId")
  removeTask(@Param("taskId") taskId: string) {
    return this.svc.removeTask(taskId);
  }
}
