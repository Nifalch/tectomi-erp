import { Module } from "@nestjs/common";
import { JournalEntriesController } from "./journal-entries.controller";
import { JournalEntriesService } from "./journal-entries.service";

@Module({
  controllers: [JournalEntriesController],
  providers: [JournalEntriesService],
})
export class JournalEntriesModule {}
