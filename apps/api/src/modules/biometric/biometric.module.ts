import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import express from "express";
import { AttendanceModule } from "../attendance/attendance.module";
import { BiometricController } from "./biometric.controller";
import { BiometricService } from "./biometric.service";
import { IclockController } from "./iclock.controller";

@Module({
  imports: [AttendanceModule],
  controllers: [IclockController, BiometricController],
  providers: [BiometricService],
  exports: [BiometricService],
})
export class BiometricModule implements NestModule {
  // ESSL devices POST their punch data with Content-Type: text/plain
  // and a tab-separated body. Nest's default body parsers (JSON +
  // urlencoded) silently drop that body. Register express.text() ONLY
  // for the /iclock/* routes so the rest of the API still uses JSON
  // parsing as normal.
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.text({ type: "*/*", limit: "2mb" }))
      // path-to-regexp v6+ requires named wildcards — `iclock/*` is the
      // legacy form and triggers a Nest deprecation warning. `*path`
      // captures everything under /iclock for the body parser.
      .forRoutes({ path: "iclock/*path", method: RequestMethod.ALL });
  }
}
