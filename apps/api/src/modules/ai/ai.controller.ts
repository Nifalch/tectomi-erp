import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiService, type GeneratedProposal } from "./ai.service";
import { GenerateProposalDto } from "./dto/generate-proposal.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService, private readonly prisma: PrismaService) {}

  /**
   * POST /ai/generate-proposal
   * Body: { requirement, projectName?, clientName?, durationWeeks?, hourlyRate? }
   * Returns a structured payload the New Proposal form can drop straight in.
   * If hourlyRate isn't supplied, the org's defaultHourlyRate is used.
   *
   * Restricted to roles that can create proposals — keeps the model bill safe.
   */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER)
  @Post("generate-proposal")
  async generateProposal(@Body() dto: GenerateProposalDto): Promise<GeneratedProposal> {
    const org = await this.prisma.organizationSettings.findFirst();
    const hourlyRate =
      dto.hourlyRate ?? (org?.defaultHourlyRate ? Number(org.defaultHourlyRate) : 900);
    const currency = org?.baseCurrency ?? "INR";

    return this.ai.generateProposal(dto.requirement, {
      projectName: dto.projectName,
      clientName: dto.clientName,
      durationWeeks: dto.durationWeeks,
      hourlyRate,
      currency,
    });
  }
}
