import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Storage, Bucket } from '@google-cloud/storage';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';

export interface UploadResult {
  storageKey: string;
  bucket: string;
  fileSize: number;
  mimeType: string;
}

export interface StreamResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXTENSION: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly bucket: Bucket;
  private isGcsActive = false;
  private readonly localStorageDir: string;

  constructor() {
    this.bucketName =
      process.env.GCS_MEDIA_BUCKET ||
      process.env.GCS_BUCKET_NAME ||
      'shopcloud-media-24903284190';

    this.localStorageDir = path.resolve(process.cwd(), '.uploads');

    try {
      this.storage = new Storage();
      this.bucket = this.storage.bucket(this.bucketName);
      this.isGcsActive = true;
    } catch (err: any) {
      this.logger.warn(`GCS client initialization notice: ${err?.message}. Local fallback active.`);
      this.isGcsActive = false;
    }
  }

  getBucketName(): string {
    return this.bucketName;
  }

  isUsingGcs(): boolean {
    return this.isGcsActive;
  }

  validateImageFile(file: Express.Multer.File): { mimeType: AllowedMimeType; extension: string } {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file buffer is empty');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of 5 MB`,
      );
    }

    const mime = file.mimetype.toLowerCase() as AllowedMimeType;
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(
        `Unsupported MIME type: '${file.mimetype}'. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate magic bytes to prevent file extension / mime spoofing
    const buffer = file.buffer;
    if (!this.matchesMagicBytes(buffer, mime)) {
      throw new BadRequestException(
        `File content does not match reported MIME type '${file.mimetype}'. Magic byte validation failed.`,
      );
    }

    return {
      mimeType: mime,
      extension: MIME_TO_EXTENSION[mime],
    };
  }

  private matchesMagicBytes(buffer: Buffer, mime: AllowedMimeType): boolean {
    if (buffer.length < 12) return false;

    // JPEG magic bytes: FF D8 FF
    if (mime === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if (mime === 'image/png') {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }

    // WEBP magic bytes: 'RIFF' at 0..3 and 'WEBP' at 8..11
    if (mime === 'image/webp') {
      const riff = buffer.subarray(0, 4).toString('ascii');
      const webp = buffer.subarray(8, 12).toString('ascii');
      return riff === 'RIFF' && webp === 'WEBP';
    }

    return false;
  }

  buildProductImageKey(productId: string, extension: string): string {
    const safeProductId = productId.replace(/[^a-zA-Z0-9_-]/g, '');
    const uuid = crypto.randomUUID();
    return `products/${safeProductId}/${uuid}.${extension}`;
  }

  async uploadProductImage(productId: string, file: Express.Multer.File): Promise<UploadResult> {
    const { mimeType, extension } = this.validateImageFile(file);
    const storageKey = this.buildProductImageKey(productId, extension);

    try {
      if (this.isGcsActive && process.env.NODE_ENV !== 'test') {
        const gcsFile = this.bucket.file(storageKey);
        await gcsFile.save(file.buffer, {
          contentType: mimeType,
          metadata: {
            contentType: mimeType,
            cacheControl: 'public, max-age=86400',
            metadata: {
              productId,
              originalName: file.originalname ? path.basename(file.originalname) : 'image',
              uploadedAt: new Date().toISOString(),
            },
          },
          resumable: false,
        });

        this.logger.log(`Uploaded image to gs://${this.bucketName}/${storageKey} (${file.size} bytes)`);
        return {
          storageKey,
          bucket: this.bucketName,
          fileSize: file.size,
          mimeType,
        };
      }
    } catch (err: any) {
      this.logger.warn(`GCS upload failed: ${err?.message}. Falling back to local storage.`);
    }

    // Local filesystem storage fallback for testing / offline dev
    const localFilePath = path.join(this.localStorageDir, storageKey);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, file.buffer);

    return {
      storageKey,
      bucket: 'local-storage',
      fileSize: file.size,
      mimeType,
    };
  }

  async getFileStream(storageKey: string): Promise<StreamResult> {
    if (this.isGcsActive && process.env.NODE_ENV !== 'test') {
      try {
        const file = this.bucket.file(storageKey);
        const [exists] = await file.exists();
        if (exists) {
          const [metadata] = await file.getMetadata();
          return {
            stream: file.createReadStream(),
            contentType: metadata.contentType || 'image/jpeg',
            contentLength: metadata.size ? Number(metadata.size) : undefined,
          };
        }
      } catch (err: any) {
        this.logger.warn(`GCS read failed: ${err?.message}. Checking local storage.`);
      }
    }

    // Check local fallback
    const localFilePath = path.join(this.localStorageDir, storageKey);
    if (fs.existsSync(localFilePath)) {
      const stats = fs.statSync(localFilePath);
      const ext = path.extname(storageKey).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      if (ext === '.webp') contentType = 'image/webp';

      return {
        stream: fs.createReadStream(localFilePath),
        contentType,
        contentLength: stats.size,
      };
    }

    throw new NotFoundException(`Storage object '${storageKey}' not found`);
  }

  async fileExists(storageKey: string): Promise<boolean> {
    if (this.isGcsActive && process.env.NODE_ENV !== 'test') {
      try {
        const file = this.bucket.file(storageKey);
        const [exists] = await file.exists();
        if (exists) return true;
      } catch {
        // ignore and check local
      }
    }

    const localFilePath = path.join(this.localStorageDir, storageKey);
    return fs.existsSync(localFilePath);
  }

  async deleteFile(storageKey: string): Promise<boolean> {
    let deleted = false;

    if (this.isGcsActive && process.env.NODE_ENV !== 'test') {
      try {
        const file = this.bucket.file(storageKey);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
          this.logger.log(`Deleted GCS object gs://${this.bucketName}/${storageKey}`);
          deleted = true;
        }
      } catch (err: any) {
        this.logger.warn(`GCS delete error: ${err?.message}`);
      }
    }

    const localFilePath = path.join(this.localStorageDir, storageKey);
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
        deleted = true;
      } catch {
        // ignore
      }
    }

    return deleted;
  }

  async getSignedUrl(storageKey: string, expiresInMinutes = 15): Promise<string> {
    if (this.isGcsActive && process.env.NODE_ENV !== 'test') {
      try {
        const file = this.bucket.file(storageKey);
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiresInMinutes * 60 * 1000,
        });
        return url;
      } catch (err: any) {
        this.logger.warn(`Signed URL generation failed: ${err?.message}`);
      }
    }

    // Fallback: return API streaming relative path
    return `/api/v1/storage/file/${encodeURIComponent(storageKey)}`;
  }

  async probeStorage(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    bucket?: string;
    latencyMs?: number;
  }> {
    const started = Date.now();
    if (this.isGcsActive) {
      try {
        const [exists] = await this.bucket.exists();
        if (exists) {
          return {
            status: 'healthy',
            message: 'GCS bucket reachable and verified',
            bucket: this.bucketName,
            latencyMs: Date.now() - started,
          };
        }
        return {
          status: 'unhealthy',
          message: `GCS bucket '${this.bucketName}' does not exist`,
          bucket: this.bucketName,
        };
      } catch (err: any) {
        return {
          status: 'degraded',
          message: `GCS probe: ${err?.message || 'Permission or network issue'}`,
          bucket: this.bucketName,
        };
      }
    }

    return {
      status: 'degraded',
      message: 'GCS client inactive; local storage fallback active',
      bucket: 'local-storage',
    };
  }
}
