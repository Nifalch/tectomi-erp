import { Injectable, Logger } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null;

  constructor() {
    if (env.fileStorageDriver === "s3" && env.s3Endpoint && env.s3AccessKeyId) {
      this.s3Client = new S3Client({
        region: env.s3Region,
        endpoint: env.s3Endpoint,
        credentials: {
          accessKeyId: env.s3AccessKeyId,
          secretAccessKey: env.s3SecretAccessKey,
        },
        forcePathStyle: true,
      });
    } else {
      this.s3Client = null;
    }
  }

  getDriver() {
    return env.fileStorageDriver;
  }

  getPublicUrl(fileName: string): string {
    if (env.fileStorageDriver === "s3") {
      if (env.s3PublicUrl) {
        return `${env.s3PublicUrl.replace(/\/$/, "")}/${fileName}`;
      }
      return `${env.s3Endpoint.replace(/\/$/, "")}/${env.s3Bucket}/${fileName}`;
    }
    return `${env.appUrl.replace(/\/$/, "")}/uploads/${fileName}`;
  }

  getLocalPath(fileName: string): string {
    return path.join(process.cwd(), env.localUploadDir.replace(/^\.\//, ""), fileName);
  }

  async saveBuffer(fileName: string, content: Buffer, contentType?: string): Promise<string> {
    if (env.fileStorageDriver === "s3" && this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: env.s3Bucket,
          Key: fileName,
          Body: content,
          ContentType: contentType ?? "application/octet-stream",
        }),
      );
      this.logger.debug(`Uploaded ${fileName} to S3/R2 bucket ${env.s3Bucket}`);
      return this.getPublicUrl(fileName);
    }

    const uploadsDir = path.join(process.cwd(), env.localUploadDir.replace(/^\.\//, ""));
    await mkdir(uploadsDir, { recursive: true });
    const fullPath = path.join(uploadsDir, fileName);
    await writeFile(fullPath, content);
    return this.getPublicUrl(fileName);
  }
}
