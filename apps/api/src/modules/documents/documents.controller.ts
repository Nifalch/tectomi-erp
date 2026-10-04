import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { DocumentEntityType, RoleCode } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { extname } from "node:path";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { StorageService } from "../../common/storage/storage.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { DocumentsService } from "./documents.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
  ) {}

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER, RoleCode.EMPLOYEE, RoleCode.CLIENT)
  @Get()
  list(
    @Query("clientId") clientId?: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.documentsService.list({ clientId, projectId });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.id, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { clientId?: string; projectId?: string; entityType?: DocumentEntityType } = {},
  ) {
    const entityType =
      body.entityType ??
      (body.clientId ? DocumentEntityType.CLIENT
        : body.projectId ? DocumentEntityType.PROJECT
        : DocumentEntityType.GENERAL);

    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
    const fileUrl = await this.storageService.saveBuffer(uniqueName, file.buffer, file.mimetype);

    return this.documentsService.create(user.id, {
      fileName: file.originalname,
      fileUrl,
      entityType,
      clientId: body.clientId || undefined,
      projectId: body.projectId || undefined,
    });
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.PROJECT_MANAGER, RoleCode.HR_MANAGER, RoleCode.FINANCE_MANAGER)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.documentsService.remove(id);
  }
}
