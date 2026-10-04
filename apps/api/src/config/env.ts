// env.ts is imported at the top of main.ts (and by feature modules at
// class-decoration time), which can happen BEFORE @nestjs/config's
// ConfigModule.forRoot() runs and populates process.env from .env.
// Load dotenv ourselves so the values are present whenever this module
// is evaluated. Idempotent — ConfigModule re-loading later is a no-op.
//
// Without this, fallback strings like "http://localhost:3000" silently
// shadow the .env values and broke portal magic links (issued links
// pointed at the wrong host).
import * as dotenv from "dotenv";
dotenv.config();

// Refuse to boot in production with weak/missing secrets. In dev/test we
// fall back to a clearly-fake value so a fresh checkout can still start,
// but in production these absences indicate a misconfigured deployment
// where every JWT would be trivially forgeable.
function requireSecret(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set to a secret >= 16 chars in production.`);
  }
  return value ?? fallback;
}

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in production.");
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.API_URL ?? "http://localhost:4000/api/v1",
  jwtAccessSecret: requireSecret("JWT_ACCESS_SECRET", "dev-only-access-secret-do-not-use"),
  jwtRefreshSecret: requireSecret("JWT_REFRESH_SECRET", "dev-only-refresh-secret-do-not-use"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  fileStorageDriver: process.env.FILE_STORAGE_DRIVER ?? "local",
  localUploadDir: process.env.LOCAL_UPLOAD_DIR ?? "./uploads",
  s3Bucket: process.env.AWS_S3_BUCKET ?? "",
  s3Region: process.env.AWS_REGION ?? "auto",
  s3Endpoint: process.env.AWS_S3_ENDPOINT ?? "",
  s3PublicUrl: process.env.AWS_S3_PUBLIC_URL ?? "",
  s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  portalEnabled: (process.env.PORTAL_ENABLED ?? "false") === "true",
  portalUrl: process.env.PORTAL_URL ?? "http://localhost:3000",
  portalSessionTtlDays: Number(process.env.PORTAL_SESSION_TTL_DAYS ?? 30),
  portalMagicLinkTtlMinutes: Number(
    process.env.PORTAL_MAGIC_LINK_TTL_MINUTES ?? 15,
  ),
};

