import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ActivityType } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ActivitiesService } from "./activities.service";
import { CreateActivityDto, UpdateActivityDto } from "./dto/activity.dto";

@UseGuards(JwtAuthGuard)
@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  findAll(
    @Query()
    query: PaginationDto & {
      leadId?: string;
      dealId?: string;
      clientId?: string;
      contactId?: string;
      type?: ActivityType;
    },
  ) {
    return this.activitiesService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.activitiesService.findOne(id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(user.id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.activitiesService.remove(id);
  }
}
