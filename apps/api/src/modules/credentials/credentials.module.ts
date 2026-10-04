import { Module } from "@nestjs/common";
import { CredentialsController } from "./credentials.controller";
import { CredentialsService } from "./credentials.service";
import { CredentialCryptoService } from "./credentials.crypto";

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService, CredentialCryptoService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
