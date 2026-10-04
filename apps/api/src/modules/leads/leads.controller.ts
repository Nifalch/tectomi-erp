import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.leadsService.findAll(query);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<CreateLeadDto>) {
    return this.leadsService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.leadsService.remove(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post(":id/convert")
  convert(@Param("id") id: string) {
    return this.leadsService.convert(id);
  }

  /**
   * CSV import — body is `{ rows: [{ field: value, ... }, ...] }`. The
   * frontend has already mapped CSV columns to our field names, so this
   * endpoint just validates and inserts per row. Bad rows are skipped
   * rather than failing the batch — the response lists every skip with
   * its reason so the UI can show a per-row error summary.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post("import")
  importCsv(@Body() body: { rows: Array<Record<string, string>> }) {
    return this.leadsService.importCsv(body.rows ?? []);
  }
}
