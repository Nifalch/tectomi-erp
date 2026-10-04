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
import { SocialPostsService } from "./social-posts.service";
import {
  CreateSocialPostDto,
  ListSocialPostsQueryDto,
  UpdateSocialPostDto,
} from "./dto/social-post.dto";

const STUDIO_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("social-posts")
@Roles(...STUDIO_ROLES)
export class SocialPostsController {
  constructor(private readonly svc: SocialPostsService) {}

  @Get()
  list(@Query() query: ListSocialPostsQueryDto) {
    return this.svc.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateSocialPostDto) {
    return this.svc.create(user.id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSocialPostDto) {
    return this.svc.update(id, dto);
  }

  @Post(":id/publish")
  markPublished(@Param("id") id: string, @Body() body: { link?: string }) {
    return this.svc.markPublished(id, body.link);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
