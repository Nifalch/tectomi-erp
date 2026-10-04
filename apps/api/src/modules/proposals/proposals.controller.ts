import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateProposalDto, UpdateProposalDto } from "./dto/create-proposal.dto";
import { ProposalsService } from "./proposals.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("proposals")
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get()
  findAll(
    @Query("projectId") projectId?: string,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
  ) {
    return this.proposalsService.findAll({ projectId, clientId, status });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.proposalsService.findOne(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateProposalDto) {
    return this.proposalsService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProposalDto) {
    return this.proposalsService.update(id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.FINANCE_MANAGER)
  @Get(":id/pdf")
  async exportPdf(@Param("id") id: string, @Res() response: Response) {
    const file = await this.proposalsService.exportPdf(id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="proposal-${id}.pdf"`);
    response.send(file);
  }

  // ── Status workflow ──

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id/send")
  send(@Param("id") id: string) {
    return this.proposalsService.send(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id/accept")
  accept(@Param("id") id: string) {
    return this.proposalsService.markAccepted(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id/reject")
  reject(@Param("id") id: string) {
    return this.proposalsService.markRejected(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id/expire")
  expire(@Param("id") id: string) {
    return this.proposalsService.markExpired(id);
  }

  /**
   * Resend a rejected proposal — clears the prior client decision and
   * makes it pending again on the portal. PM-and-above.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Patch(":id/resend")
  resend(@Param("id") id: string) {
    return this.proposalsService.resend(id);
  }

  /**
   * Admin override to force-accept a proposal from any state. Use
   * when the client confirms acceptance through an off-platform
   * channel (email/phone) and we want the project to proceed.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Patch(":id/force-accept")
  forceAccept(@Param("id") id: string) {
    return this.proposalsService.forceAccept(id);
  }

  // Only SUPER_ADMIN can hard-delete a proposal — guards against accidental wipes.
  @Roles(RoleCode.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.proposalsService.remove(id);
  }
}
