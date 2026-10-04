import { Module } from "@nestjs/common";
import { StorageService } from "../../common/storage/storage.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [NotificationsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

