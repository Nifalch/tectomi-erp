import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CreateClientDto } from "./dto/create-client.dto";
import { ClientsService } from "./clients.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get()
  findAll(@Query() query: PaginationDto & { includeArchived?: string }) {
    return this.clientsService.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get("tags")
  listTags() {
    return this.clientsService.listTags();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: { id: string }) {
    return this.clientsService.create(dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.clientsService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id/history")
  history(@Param("id") id: string) {
    return this.clientsService.getHistory(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateClientDto>,
    @CurrentUser() user: { id: string },
  ) {
    return this.clientsService.update(id, dto, user.id);
  }

  // Deletion is restricted to SUPER_ADMIN.
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.clientsService.remove(id, user.id);
  }

  // ── Merge duplicates ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("merge")
  merge(
    @Body() body: { primaryId: string; duplicateId: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.clientsService.merge(body.primaryId, body.duplicateId, user.id);
  }

  // ── Bulk actions ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("bulk-update")
  bulkUpdate(
    @Body()
    body: {
      ids: string[];
      priority?: string;
      status?: string;
      accountManagerId?: string | null;
      addTags?: string[];
      removeTags?: string[];
    },
  ) {
    return this.clientsService.bulkUpdate(body);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post("bulk-delete")
  bulkDelete(@Body() body: { ids: string[] }) {
    return this.clientsService.bulkDelete(body.ids);
  }

  // ── CSV import ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("import")
  importCsv(@Body() body: { rows: Array<Record<string, string>> }) {
    return this.clientsService.importCsv(body.rows ?? []);
  }

  // ── Client Portal invite / revoke ──
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post(":id/invite-portal")
  invitePortal(@Param("id") id: string) {
    return this.clientsService.invitePortal(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post(":id/revoke-portal")
  revokePortal(@Param("id") id: string) {
    return this.clientsService.revokePortal(id);
  }
}
