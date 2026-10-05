import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StorageService } from '../storage/storage.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Response } from 'express';

describe('Products - Images & Cloud Storage', () => {
  let controller: ProductsController;
  let service: ProductsService;
  let storageService: StorageService;
  let testProductId: string;

  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00,
  ]);

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

  beforeEach(async () => {
    storageService = new StorageService();
    service = new ProductsService(storageService);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductsController>(ProductsController);

    const prod = await service.findById('samsung-galaxy-s25-ultra');
    testProductId = prod.id;
  });

  it('uploads a product image and attaches storage metadata', async () => {
    const file = createMockFile('test.jpg', 'image/jpeg', validJpegBuffer);
    const uploaded = await controller.uploadImage(
      testProductId,
      file,
      'Titanium back view',
      true,
    );

    expect(uploaded).toBeDefined();
    expect(uploaded.id).toBeDefined();
    expect(uploaded.storageKey).toBeDefined();
    expect(uploaded.storageKey.startsWith(`products/${testProductId}/`)).toBe(true);
    expect(uploaded.mimeType).toBe('image/jpeg');
    expect(uploaded.fileSize).toBe(validJpegBuffer.length);
    expect(uploaded.isPrimary).toBe(true);
    expect(uploaded.url).toContain(`/images/${uploaded.id}/file`);
  });

  it('rejects upload with invalid MIME or magic bytes', async () => {
    const invalidFile = createMockFile('malicious.jpg', 'image/jpeg', Buffer.from('not an image'));
    await expect(controller.uploadImage(testProductId, invalidFile)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lists product images', async () => {
    const file = createMockFile('list-test.jpg', 'image/jpeg', validJpegBuffer);
    await controller.uploadImage(testProductId, file, 'List test');

    const images = await controller.getImages(testProductId);
    expect(Array.isArray(images)).toBe(true);
    expect(images.length).toBeGreaterThan(0);
  });

  it('retrieves single image metadata', async () => {
    const file = createMockFile('single-test.jpg', 'image/jpeg', validJpegBuffer);
    const uploaded = await controller.uploadImage(testProductId, file, 'Single test');

    const single = await controller.getImage(testProductId, uploaded.id);
    expect(single.id).toBe(uploaded.id);
  });

  it('throws 404 when image is not found', async () => {
    await expect(controller.getImage(testProductId, 'nonexistent-img-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generates signed URL or streaming path for an image', async () => {
    const file = createMockFile('signed.jpg', 'image/jpeg', validJpegBuffer);
    const uploaded = await controller.uploadImage(testProductId, file);

    const res = await controller.getSignedUrl(testProductId, uploaded.id, 15);
    expect(res.url).toBeDefined();
    expect(res.storageKey).toBe(uploaded.storageKey);
  });

  it('sets an image as primary', async () => {
    const file1 = createMockFile('img1.jpg', 'image/jpeg', validJpegBuffer);
    const file2 = createMockFile('img2.jpg', 'image/jpeg', validJpegBuffer);
    const up1 = await controller.uploadImage(testProductId, file1, 'Image 1', true);
    const up2 = await controller.uploadImage(testProductId, file2, 'Image 2', false);

    const setRes = await controller.setPrimaryImage(testProductId, up2.id);
    expect(setRes.success).toBe(true);
  });

  it('deletes an image from storage and product', async () => {
    const file = createMockFile('to-delete.jpg', 'image/jpeg', validJpegBuffer);
    const uploaded = await controller.uploadImage(testProductId, file);

    const delRes = await controller.deleteImage(testProductId, uploaded.id);
    expect(delRes.success).toBe(true);

    // Verify file deleted from storage
    const exists = await storageService.fileExists(uploaded.storageKey!);
    expect(exists).toBe(false);
  });
});
