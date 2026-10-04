import { Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.notificationsService.list(user.id, {
      unread: unread === "true",
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.notificationsService.unreadCount(user.id);
  }

  // POST variants per spec
  @Post(":id/read")
  markReadPost(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Post("read-all")
  readAll(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllRead(user.id);
  }

  // Back-compat with the existing PATCH route.
  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.notificationsService.markRead(id, user.id);
  }
}
