import {
  Body,
  Controller,
  Delete,
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
import { ChatService } from "./chat.service";
import { AddReactionDto } from "./dto/add-reaction.dto";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { CreateDirectChannelDto } from "./dto/create-direct-channel.dto";
import { CreateGroupChannelDto } from "./dto/create-group-channel.dto";
import { CreateProjectChannelDto } from "./dto/create-project-channel.dto";
import { EditMessageDto } from "./dto/edit-message.dto";
import { SendMessageDto } from "./dto/send-message.dto";

interface AuthedUser {
  id: string;
  roles?: RoleCode[];
}

const ALL_EXCEPT_CLIENT: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.ADMIN,
  RoleCode.PROJECT_MANAGER,
  RoleCode.HR_MANAGER,
  RoleCode.FINANCE_MANAGER,
  RoleCode.EMPLOYEE,
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Roles(...ALL_EXCEPT_CLIENT)
  @Get("channels")
  listChannels(@CurrentUser() user: AuthedUser) {
    return this.chat.listChannels(user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN)
  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto, @CurrentUser() user: AuthedUser) {
    return this.chat.createGlobalChannel(dto.name, dto.description, user.id);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("channels/direct")
  createDirectChannel(
    @Body() dto: CreateDirectChannelDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.ensureDirectChannel(user.id, dto.userId);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("channels/group")
  createGroupChannel(
    @Body() dto: CreateGroupChannelDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.createGroupChannel(user.id, {
      name: dto.name,
      memberIds: dto.memberIds,
      description: dto.description,
    });
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("channels/project/:projectId")
  createProjectChannel(
    @Param("projectId") projectId: string,
    @Body() dto: CreateProjectChannelDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.createProjectChannel(user.id, projectId, {
      name: dto.name,
      description: dto.description,
    });
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Get("channels/:id")
  getChannel(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.getChannel(id, user.id);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Get("channels/:id/members")
  listMembers(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.listMembers(id, user.id);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Get("channels/:id/messages")
  listMessages(
    @Param("id") id: string,
    @CurrentUser() user: AuthedUser,
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ) {
    const lim = limit ? Number.parseInt(limit, 10) : undefined;
    return this.chat.getMessages(id, user.id, {
      before,
      limit: Number.isFinite(lim) ? (lim as number) : undefined,
    });
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("channels/:id/messages")
  sendMessage(
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.sendMessage(id, user.id, dto.content);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("channels/:id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.markRead(id, user.id);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Patch("messages/:id")
  editMessage(
    @Param("id") id: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.editMessage(id, user.id, dto.content);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Delete("messages/:id")
  deleteMessage(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.deleteMessage(id, user.id, user.roles ?? []);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Post("messages/:id/reactions")
  addReaction(
    @Param("id") id: string,
    @Body() dto: AddReactionDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.addReaction(id, user.id, dto.emoji);
  }

  @Roles(...ALL_EXCEPT_CLIENT)
  @Delete("messages/:id/reactions/:emoji")
  removeReaction(
    @Param("id") id: string,
    @Param("emoji") emoji: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.removeReaction(id, user.id, decodeURIComponent(emoji));
  }
}
