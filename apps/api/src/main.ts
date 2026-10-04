import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import express from "express";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { DecimalSerializerInterceptor } from "./common/interceptors/decimal-serializer.interceptor";
import { env } from "./config/env";

async function bootstrap() {
  // Allow the staff web (3001) and any legacy 3000 client. CORS_ORIGIN env
  // can override with a comma-separated allow-list for prod / different
  // hostnames. Browsers block fetches if the page's origin isn't in this
  // list, which manifests as "data not loading" even though the API is up.
  const configuredOrigins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (curl, server-to-server, mobile apps)
        if (!requestOrigin) {
          return callback(null, true);
        }

        // If wildcard is configured or origin is on onrender.com or localhost
        if (
          configuredOrigins.includes("*") ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin) ||
          /^https:\/\/.*\.onrender\.com$/.test(requestOrigin) ||
          configuredOrigins.includes(requestOrigin)
        ) {
          return callback(null, requestOrigin);
        }

        callback(null, requestOrigin);
      },
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    },
  });

  // Trust the X-Forwarded-For header set by reverse proxies (nginx,
  // Cloudflare, AWS ELB, etc.) so `req.ip` resolves to the real client
  // address instead of the proxy. Without this the office-network
  // attendance check fails in production: every clock-in looks like it's
  // coming from the load balancer's IP, never from the office WiFi NAT.
  // We trust 1 hop by default; in dev with no proxy it falls back to the
  // socket address and still behaves correctly.
  const httpAdapter = app.getHttpAdapter().getInstance() as express.Express;
  httpAdapter.set("trust proxy", process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal");

  app.use(cookieParser());

  if (!env.portalEnabled) {
    app.use("/api/v1/client-portal", (_req: express.Request, res: express.Response) => {
      res.status(404).json({ error: "not_found" });
    });
  }

  const uploadsDir = path.join(process.cwd(), env.localUploadDir.replace(/^\.\//, ""));
  mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new DecimalSerializerInterceptor(),
  );

  const config = new DocumentBuilder()
    .setTitle("Tectomi ERP API")
    .setDescription("Internal management platform API for Tectomi")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, "0.0.0.0");
}

bootstrap();
