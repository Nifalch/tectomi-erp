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
import { TeamToolsService } from "./team-tools.service";
import {
  CreateTeamToolDto,
  ListTeamToolsQueryDto,
  UpdateTeamToolDto,
} from "./dto/team-tool.dto";

const STUDIO_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("team-tools")
@Roles(...STUDIO_ROLES)
export class TeamToolsController {
  constructor(private readonly svc: TeamToolsService) {}

  @Get()
  list(@Query() query: ListTeamToolsQueryDto) {
    return this.svc.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateTeamToolDto) {
    return this.svc.create(user.id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTeamToolDto) {
    return this.svc.update(id, dto);
  }

  @Post(":id/pin")
  togglePin(@Param("id") id: string) {
    return this.svc.togglePin(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post("seed")
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  seed(@CurrentUser() user: { id: string }) {
    return this.svc.seedStarterCatalog(user.id);
  }
}
