import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ClientPortalGuard } from "../client-portal.guard";
import { Portal, PortalContext } from "../portal-context.decorator";
import { PortalChatService } from "./portal-chat.service";

class PostMessageDto {
  @IsString() content!: string;
}

@Controller("client-portal/projects/:projectId/chat")
@UseGuards(ClientPortalGuard, ThrottlerGuard)
export class PortalChatController {
  constructor(private readonly svc: PortalChatService) {}

  @Get()
  list(
    @Portal() p: PortalContext,
    @Param("projectId") projectId: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ) {
    return this.svc.list(p.clientId, projectId, {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  post(
    @Portal() p: PortalContext,
    @Param("projectId") projectId: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.svc.post(p.clientId, p.contactId, projectId, dto.content);
  }
}
