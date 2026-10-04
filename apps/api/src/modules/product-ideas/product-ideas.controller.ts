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
import { ProductIdeasService } from "./product-ideas.service";
import {
  CreateProductIdeaDto,
  CreateProductIdeaTaskDto,
  ListProductIdeasQueryDto,
  UpdateProductIdeaDto,
  UpdateProductIdeaTaskDto,
} from "./dto/product-idea.dto";

const STUDIO_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("product-ideas")
@Roles(...STUDIO_ROLES)
export class ProductIdeasController {
  constructor(private readonly svc: ProductIdeasService) {}

  @Get()
  list(@Query() query: ListProductIdeasQueryDto) {
    return this.svc.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateProductIdeaDto) {
    return this.svc.create(user.id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductIdeaDto) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post(":id/vote")
  toggleVote(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.svc.toggleVote(id, user.id);
  }

  @Post(":id/tasks")
  addTask(@Param("id") id: string, @Body() dto: CreateProductIdeaTaskDto) {
    return this.svc.addTask(id, dto);
  }

  @Patch("tasks/:taskId")
  updateTask(@Param("taskId") taskId: string, @Body() dto: UpdateProductIdeaTaskDto) {
    return this.svc.updateTask(taskId, dto);
  }

  @Delete("tasks/:taskId")
  removeTask(@Param("taskId") taskId: string) {
    return this.svc.removeTask(taskId);
  }
}
