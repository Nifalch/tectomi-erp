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
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  AssignAssetDto,
  CreateAssetDto,
  ListAssetsDto,
  UpdateAssetDto,
} from "./dto/asset.dto";
import { AssetsService } from "./assets.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("assets")
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get()
  list(@Query() query: ListAssetsDto) {
    return this.svc.list(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.svc.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAssetDto) {
    return this.svc.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post(":id/assign")
  assign(@Param("id") id: string, @Body() dto: AssignAssetDto) {
    return this.svc.assign(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post(":id/unassign")
  unassign(@Param("id") id: string) {
    return this.svc.unassign(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
