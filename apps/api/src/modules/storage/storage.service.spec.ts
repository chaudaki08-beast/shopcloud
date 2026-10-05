import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StorageService, MAX_FILE_SIZE_BYTES } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService();
  });

  const createMockFile = (
    originalname: string,
    mimetype: string,
    buffer: Buffer,
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
    destination: '',
    filename: originalname,
    path: '',
    stream: null as any,
  });

  // Valid JPEG header: FF D8 FF E0 00 10 4A 46 49 46 00 01
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00,
  ]);

  // Valid PNG header: 89 50 4E 47 0D 0A 1A 0A 00 00 00 0D
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);

  // Valid WEBP header: 'RIFF' .... 'WEBP'
  const validWebpBuffer = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.from('VP8 ', 'ascii'),
  ]);

  describe('validateImageFile', () => {
    it('accepts valid JPEG file', () => {
      const file = createMockFile('test.jpg', 'image/jpeg', validJpegBuffer);
      const res = service.validateImageFile(file);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.extension).toBe('jpg');
    });

    it('accepts valid PNG file', () => {
      const file = createMockFile('test.png', 'image/png', validPngBuffer);
      const res = service.validateImageFile(file);
      expect(res.mimeType).toBe('image/png');
      expect(res.extension).toBe('png');
    });

    it('accepts valid WEBP file', () => {
      const file = createMockFile('test.webp', 'image/webp', validWebpBuffer);
      const res = service.validateImageFile(file);
      expect(res.mimeType).toBe('image/webp');
      expect(res.extension).toBe('webp');
    });

    it('rejects unsupported MIME type (e.g. text/html, application/pdf)', () => {
      const file = createMockFile('malicious.html', 'text/html', Buffer.from('<html></html>'));
      expect(() => service.validateImageFile(file)).toThrow(BadRequestException);
    });

    it('rejects file exceeding MAX_FILE_SIZE_BYTES (5MB)', () => {
      const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);
      // Put valid jpeg header at the start so magic byte passes
      validJpegBuffer.copy(oversizedBuffer, 0, 0, validJpegBuffer.length);
      const file = createMockFile('huge.jpg', 'image/jpeg', oversizedBuffer);
      expect(() => service.validateImageFile(file)).toThrow(BadRequestException);
    });

    it('rejects spoofed file with JPEG extension and MIME but invalid magic bytes', () => {
      const spoofedBuffer = Buffer.from('Not a real jpeg file, just plain ascii text');
      const file = createMockFile('spoofed.jpg', 'image/jpeg', spoofedBuffer);
      expect(() => service.validateImageFile(file)).toThrow(BadRequestException);
    });

    it('rejects empty or null file', () => {
      const emptyFile = createMockFile('empty.jpg', 'image/jpeg', Buffer.alloc(0));
      expect(() => service.validateImageFile(emptyFile)).toThrow(BadRequestException);
    });
  });

  describe('buildProductImageKey', () => {
    it('generates a clean deterministic path without path traversal', () => {
      const key = service.buildProductImageKey('../../etc/passwd', 'jpg');
      expect(key.startsWith('products/')).toBe(true);
      expect(key).not.toContain('..');
      expect(key).not.toContain('/etc/');
      expect(key.endsWith('.jpg')).toBe(true);
    });

    it('generates unique keys for subsequent calls', () => {
      const key1 = service.buildProductImageKey('prod-1', 'png');
      const key2 = service.buildProductImageKey('prod-1', 'png');
      expect(key1).not.toBe(key2);
      expect(key1.startsWith('products/prod-1/')).toBe(true);
      expect(key2.startsWith('products/prod-1/')).toBe(true);
    });
  });

  describe('Storage CRUD (Local/Mock & GCS fallback)', () => {
    it('uploads an image and returns storage key and metadata', async () => {
      const file = createMockFile('product.jpg', 'image/jpeg', validJpegBuffer);
      const res = await service.uploadProductImage('prod-unit-test', file);

      expect(res.storageKey).toBeDefined();
      expect(res.storageKey.startsWith('products/prod-unit-test/')).toBe(true);
      expect(res.storageKey.endsWith('.jpg')).toBe(true);
      expect(res.fileSize).toBe(validJpegBuffer.length);
      expect(res.mimeType).toBe('image/jpeg');

      // Verify file exists
      const exists = await service.fileExists(res.storageKey);
      expect(exists).toBe(true);

      // Verify getStream
      const streamRes = await service.getFileStream(res.storageKey);
      expect(streamRes.stream).toBeDefined();
      expect(streamRes.contentType).toContain('image');

      // Verify deletion
      const deleted = await service.deleteFile(res.storageKey);
      expect(deleted).toBe(true);

      // Verify no longer exists
      const afterDeleteExists = await service.fileExists(res.storageKey);
      expect(afterDeleteExists).toBe(false);
    });

    it('throws NotFoundException when streaming a nonexistent key', async () => {
      await expect(service.getFileStream('products/prod-unit-test/nonexistent.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('generates signed URL or fallback streaming path', async () => {
      const signedUrl = await service.getSignedUrl('products/p1/sample.jpg');
      expect(typeof signedUrl).toBe('string');
      expect(signedUrl.length).toBeGreaterThan(0);
    });

    it('probes storage reporting real status', async () => {
      const probe = await service.probeStorage();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(probe.status);
      expect(probe.bucket).toBeDefined();
    });
  });
});
