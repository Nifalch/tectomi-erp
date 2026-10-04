import {
  Body,
  Controller,
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
import { CreateCycleDto } from "./dto/create-cycle.dto";
import {
  Feedback360Dto,
  ListReviewsDto,
  ManagerReviewDto,
  SelfReviewDto,
} from "./dto/review.dto";
import { PerformanceReviewsService } from "./performance-reviews.service";

const ALL_ROLES = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.HR_MANAGER,
  RoleCode.PROJECT_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("performance-reviews")
export class PerformanceReviewsController {
  constructor(private readonly svc: PerformanceReviewsService) {}

  // Cycles
  @Roles(...ALL_ROLES)
  @Get("cycles")
  listCycles(@CurrentUser() user: { id: string; roles?: RoleCode[] }) {
    return this.svc.listCycles(user);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("cycles")
  createCycle(@Body() dto: CreateCycleDto) {
    return this.svc.createCycle(dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("cycles/:id/activate")
  activateCycle(@Param("id") id: string) {
    return this.svc.activateCycle(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("cycles/:id/complete")
  completeCycle(@Param("id") id: string) {
    return this.svc.completeCycle(id);
  }

  // One-shot backfill of EmployeeProfile.performanceScore from existing
  // completed reviews. Safe to call multiple times — it's idempotent.
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR_MANAGER)
  @Post("rollup-scores")
  rollupScores() {
    return this.svc.rollupAllEmployeeScores();
  }

  // Reviews
  @Roles(...ALL_ROLES)
  @Get("reviews")
  listReviews(
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Query() query: ListReviewsDto,
  ) {
    return this.svc.listReviews(user, query);
  }

  @Roles(...ALL_ROLES)
  @Get("reviews/my/to-self-review")
  listSelfReviews(@CurrentUser() user: { id: string }) {
    return this.svc.listSelfReviews(user.id);
  }

  @Roles(...ALL_ROLES)
  @Get("reviews/my/to-review")
  listReviewsToReview(@CurrentUser() user: { id: string }) {
    return this.svc.listReviewsToReview(user.id);
  }

  @Roles(...ALL_ROLES)
  @Get("reviews/:id")
  getReview(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.getReview(id, user);
  }

  @Roles(...ALL_ROLES)
  @Patch("reviews/:id/self-review")
  selfReview(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() dto: SelfReviewDto,
  ) {
    return this.svc.submitSelfReview(id, user, dto);
  }

  @Roles(...ALL_ROLES)
  @Patch("reviews/:id/manager-review")
  managerReview(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() dto: ManagerReviewDto,
  ) {
    return this.svc.submitManagerReview(id, user, dto);
  }

  // 360 Feedback
  @Roles(...ALL_ROLES)
  @Post("reviews/:id/feedback360")
  addFeedback360(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
    @Body() dto: Feedback360Dto,
  ) {
    return this.svc.addFeedback360(id, user, dto);
  }

  @Roles(...ALL_ROLES)
  @Get("reviews/:id/feedback360")
  listFeedback360(
    @Param("id") id: string,
    @CurrentUser() user: { id: string; roles?: RoleCode[] },
  ) {
    return this.svc.listFeedback360(id, user);
  }
}
