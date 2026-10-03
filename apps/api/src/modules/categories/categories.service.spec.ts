import { CategoriesService } from './categories.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    service = new CategoriesService();
    try {
      await service.remove('smart-home-iot');
    } catch {}
    try {
      await service.remove('temp-cat-for-delete');
    } catch {}
  });

  afterAll(async () => {
    try {
      await service.remove('smart-home-iot');
    } catch {}
    try {
      await service.remove('temp-cat-for-delete');
    } catch {}
  });

  it('should list initial seed categories', async () => {
    const categories = await service.findAll();
    expect(categories.length).toBeGreaterThanOrEqual(3);
    expect(categories.some((c) => c.slug === 'smartphones')).toBe(true);
  });

  it('should find category by ID or slug', async () => {
    const byId = await service.findById('cat-smartphones');
    expect(byId.name).toBe('Smartphones');

    const bySlug = await service.findById('smartphones');
    expect(bySlug.id).toBe('cat-smartphones');
  });

  it('should throw NotFoundException for unknown category', async () => {
    await expect(service.findById('non-existent-cat')).rejects.toThrow(NotFoundException);
  });

  it('should create a new category and generate a slug', async () => {
    const created = await service.create({
      name: 'Smart Home & IoT',
      description: 'Connected smart devices for home automation',
    });

    expect(created.name).toBe('Smart Home & IoT');
    expect(created.slug).toBe('smart-home-iot');

    const retrieved = await service.findById('smart-home-iot');
    expect(retrieved.id).toBe(created.id);
  });

  it('should reject category creation with duplicate slug (ConflictException)', async () => {
    await expect(
      service.create({
        name: 'Smartphones Duplicate',
        slug: 'smartphones',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should update an existing category', async () => {
    const updated = await service.update('cat-audio', {
      name: 'Premium Audio & Sound Systems',
      description: 'Audiophile grade headphones and studio monitors',
    });

    expect(updated.name).toBe('Premium Audio & Sound Systems');
    expect(updated.description).toBe('Audiophile grade headphones and studio monitors');
  });

  it('should reject category deletion when associated products exist', async () => {
    await expect(service.remove('cat-smartphones')).rejects.toThrow(ConflictException);
  });

  it('should successfully delete an unused category', async () => {
    const created = await service.create({
      name: 'Temporary Category',
      slug: 'temp-cat-for-delete',
    });

    const res = await service.remove(created.id);
    expect(res.success).toBe(true);
    await expect(service.findById(created.id)).rejects.toThrow(NotFoundException);
  });
});
