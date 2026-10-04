import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SavedViewsService } from "./saved-views.service";

@UseGuards(JwtAuthGuard)
@Controller("saved-views")
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

  @Get()
  list(@CurrentUser() user: { id: string }, @Query("module") module?: string) {
    return this.service.list(user.id, module);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: { module: string; name: string; filters: unknown; isDefault?: boolean },
  ) {
    return this.service.create(user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() dto: { name?: string; filters?: unknown; isDefault?: boolean },
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.service.remove(user.id, id);
  }
}
