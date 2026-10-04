import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { OnboardingService } from "./onboarding.service";
import { CreateOnboardingChecklistDto, ToggleOnboardingItemDto } from "./dto/create-onboarding.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Get()
  findAll() {
    return this.onboardingService.findAll();
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER)
  @Post()
  create(@Body() dto: CreateOnboardingChecklistDto) {
    return this.onboardingService.create(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR_MANAGER, RoleCode.EMPLOYEE)
  @Patch(":id/items/:itemId")
  toggleItem(@Param("id") id: string, @Param("itemId") itemId: string, @Body() dto: ToggleOnboardingItemDto) {
    return this.onboardingService.toggleItem(id, itemId, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.onboardingService.remove(id);
  }
}
