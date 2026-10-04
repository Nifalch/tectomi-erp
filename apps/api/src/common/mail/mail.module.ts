import { Global, Module } from "@nestjs/common";
import { MailController } from "./mail.controller";
import { MailService } from "./mail.service";

/**
 * Global MailModule — gives every feature module access to MailService
 * without re-registering it as a provider. Also exposes the
 * /mail/settings + /mail/test endpoints that back the Settings → Email
 * page.
 */
@Global()
@Module({
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
