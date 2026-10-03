import { ProductsService } from './products.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { prisma } from '@shopcloud/database';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    service = new ProductsService();
    try {
      await prisma.product.deleteMany({
        where: { sku: 'GOOG-PIX9-FOLD' },
      });
    } catch {}
  });

  afterAll(async () => {
    try {
      await prisma.product.deleteMany({
        where: { sku: 'GOOG-PIX9-FOLD' },
      });
    } catch {}
  });

  describe('findAll, pagination & filtering', () => {
    it('should return paginated products with structured meta envelope', async () => {
      const res = await service.findAll({ page: 1, limit: 3 });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeLessThanOrEqual(3);
      expect(res.meta).toBeDefined();
      expect(res.meta.page).toBe(1);
      expect(res.meta.limit).toBe(3);
      expect(res.meta.total).toBeGreaterThanOrEqual(5);
    });

    it('should filter products by category slug', async () => {
      const res = await service.findAll({ categorySlug: 'smartphones' });

      expect(res.data.length).toBeGreaterThan(0);
      res.data.forEach((p) => {
        expect(p.category?.slug).toBe('smartphones');
      });
    });

    it('should filter products by price boundaries', async () => {
      // Products between ₹50,000 (5,000,000) and ₹1,50,000 (15,000,000)
      const res = await service.findAll({
        minPrice: 5000000,
        maxPrice: 15000000,
      });

      expect(res.data.length).toBeGreaterThan(0);
      res.data.forEach((p) => {
        expect(p.price).toBeGreaterThanOrEqual(5000000);
        expect(p.price).toBeLessThanOrEqual(15000000);
      });
    });

    it('should search products by text query', async () => {
      const res = await service.findAll({ search: 'Galaxy' });
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data[0].name).toContain('Galaxy');
    });

    it('should sort products by allowlisted price ascending and descending', async () => {
      const ascRes = await service.findAll({ sortBy: 'price', sortOrder: 'asc' });
      for (let i = 1; i < ascRes.data.length; i++) {
        expect(ascRes.data[i].price).toBeGreaterThanOrEqual(ascRes.data[i - 1].price);
      }

      const descRes = await service.findAll({ sortBy: 'price', sortOrder: 'desc' });
      for (let i = 1; i < descRes.data.length; i++) {
        expect(descRes.data[i].price).toBeLessThanOrEqual(descRes.data[i - 1].price);
      }
    });
  });

  describe('findById and findBySlug', () => {
    it('should find product by unique slug or ID', async () => {
      const bySlug = await service.findById('samsung-galaxy-s25-ultra');
      expect(bySlug.name).toContain('Galaxy S25');

      const byId = await service.findById(bySlug.id);
      expect(byId.slug).toBe('samsung-galaxy-s25-ultra');
    });

    it('should throw NotFoundException for non-existent product', async () => {
      await expect(service.findById('non-existent-prod')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create, update & remove', () => {
    it('should create a valid product', async () => {
      const created = await service.create({
        name: 'Google Pixel 9 Pro Fold',
        sku: 'GOOG-PIX9-FOLD',
        description: 'Foldable Android flagship device with Google Tensor G4',
        price: 17299900,
        discountPercentage: 5,
        stock: 12,
        categoryId: 'cat-smartphones',
      });

      expect(created.id).toBeDefined();
      expect(created.sku).toBe('GOOG-PIX9-FOLD');
      expect(created.slug).toBe('google-pixel-9-pro-fold');

      const found = await service.findById(created.id);
      expect(found.name).toBe('Google Pixel 9 Pro Fold');
    });

    it('should reject creation with duplicate SKU (ConflictException)', async () => {
      await expect(
        service.create({
          name: 'Duplicate Phone',
          sku: 'SAM-S25-512-TI', // Existing seed SKU
          description: 'Duplicate description',
          price: 9999900,
          stock: 5,
          categoryId: 'cat-smartphones',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update product details', async () => {
      const updated = await service.update('prod-s25-ultra', {
        stock: 60,
        discountPercentage: 15,
      });

      expect(updated.stock).toBe(60);
      expect(updated.discountPercentage).toBe(15);
    });

    it('should soft-delete product', async () => {
      const res = await service.remove('prod-xps-16');
      expect(res.success).toBe(true);

      const found = await service.findById('prod-xps-16');
      expect(found.isActive).toBe(false);
    });
  });
});
