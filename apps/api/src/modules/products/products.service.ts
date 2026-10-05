import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { prisma, Prisma } from '@shopcloud/database';
import {
  PaginatedResult,
  ProductDto,
  CategoryDto,
} from '@shopcloud/contracts';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { useDatabase } from '../../db-status';
import { rethrowInProduction } from '../../common/runtime-mode';
import { StorageService } from '../storage/storage.service';

const SEED_CATEGORIES: CategoryDto[] = [
  {
    id: 'cat-smartphones',
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'Next-generation flagship smartphones and mobile devices',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-laptops',
    name: 'Laptops',
    slug: 'laptops',
    description: 'High-performance laptops for creators, professionals and developers',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-audio',
    name: 'Audio & Wearables',
    slug: 'audio',
    description: 'Noise cancelling headphones, earbuds and smart accessories',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SEED_PRODUCTS: ProductDto[] = [
  {
    id: 'prod-s25-ultra',
    name: 'Samsung Galaxy S25 Ultra 5G',
    slug: 'samsung-galaxy-s25-ultra',
    sku: 'SAM-S25-512-TI',
    description: 'Titanium Grey, 512GB Storage, 12GB RAM, 200MP Camera, AI-powered smartphone.',
    price: 12999900,
    discountPercentage: 10,
    stock: 45,
    categoryId: 'cat-smartphones',
    category: SEED_CATEGORIES[0],
    images: [
      {
        id: 'img-1',
        url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
        isPrimary: true,
        altText: 'Samsung Galaxy S25 Front & Back View',
      },
    ],
    isActive: true,
    attributes: { storage: '512GB', color: 'Titanium Grey', screen: '6.8 Dynamic AMOLED' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-ip16-pro',
    name: 'Apple iPhone 16 Pro Max',
    slug: 'apple-iphone-16-pro-max',
    sku: 'APL-IP16PM-256-DES',
    description: 'Grade 5 Titanium design with Desert Titanium finish, A18 Pro chip, 48MP Fusion camera.',
    price: 14490000,
    discountPercentage: 5,
    stock: 3,
    categoryId: 'cat-smartphones',
    category: SEED_CATEGORIES[0],
    images: [
      {
        id: 'img-2',
        url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80',
        isPrimary: true,
        altText: 'iPhone 16 Pro Max Desert Titanium',
      },
    ],
    isActive: true,
    attributes: { storage: '256GB', color: 'Desert Titanium', display: '6.9 Super Retina XDR' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mbp-16',
    name: 'MacBook Pro 16" (M4 Max)',
    slug: 'macbook-pro-16-m4-max',
    sku: 'APL-MBP16-M4M-36G',
    description: 'Space Black, Apple M4 Max 14-core CPU, 32-core GPU, 36GB Unified Memory, 1TB SSD.',
    price: 34990000,
    discountPercentage: 7,
    stock: 15,
    categoryId: 'cat-laptops',
    category: SEED_CATEGORIES[1],
    images: [
      {
        id: 'img-3',
        url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
        isPrimary: true,
        altText: 'MacBook Pro 16 M4 Max Space Black',
      },
    ],
    isActive: true,
    attributes: { memory: '36GB', storage: '1TB SSD', processor: 'Apple M4 Max' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-xps-16',
    name: 'Dell XPS 16 OLED Developer Edition',
    slug: 'dell-xps-16-oled',
    sku: 'DEL-XPS16-U9-32G',
    description: 'Intel Core Ultra 9, NVIDIA RTX 4070, 32GB LPDDR5x, 1TB PCIe NVMe SSD, 4K+ OLED Touch.',
    price: 28999900,
    discountPercentage: 12,
    stock: 2,
    categoryId: 'cat-laptops',
    category: SEED_CATEGORIES[1],
    images: [
      {
        id: 'img-4',
        url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80',
        isPrimary: true,
        altText: 'Dell XPS 16 OLED',
      },
    ],
    isActive: true,
    attributes: { memory: '32GB', storage: '1TB SSD', display: '16.3 4K+ OLED' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-wh1000xm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    slug: 'sony-wh-1000xm5-silver',
    sku: 'SNY-WH1000XM5-SLV',
    description: 'Industry-leading noise cancellation with Auto NC Optimizer, 30 hours battery life, Silver.',
    price: 2999000,
    discountPercentage: 15,
    stock: 50,
    categoryId: 'cat-audio',
    category: SEED_CATEGORIES[2],
    images: [
      {
        id: 'img-5',
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
        isPrimary: true,
        altText: 'Sony WH-1000XM5 Silver Noise Cancelling Headphones',
      },
    ],
    isActive: true,
    attributes: { color: 'Silver', battery: '30 hours', connection: 'Bluetooth 5.2 / 3.5mm' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

@Injectable()
export class ProductsService {
  private localProducts: ProductDto[] = [...SEED_PRODUCTS];

  constructor(private readonly storageService: StorageService = new StorageService()) {}

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<ProductDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Normalize sorting
    let sortField = 'createdAt';
    let sortDir: 'asc' | 'desc' = query.sortOrder || 'desc';

    if (query.sortBy === 'price_asc') {
      sortField = 'price';
      sortDir = 'asc';
    } else if (query.sortBy === 'price_desc') {
      sortField = 'price';
      sortDir = 'desc';
    } else if (query.sortBy === 'name_asc') {
      sortField = 'name';
      sortDir = 'asc';
    } else if (query.sortBy === 'created_at_desc') {
      sortField = 'createdAt';
      sortDir = 'desc';
    } else if (query.sortBy && ['name', 'price', 'createdAt', 'updatedAt'].includes(query.sortBy)) {
      sortField = query.sortBy;
      sortDir = query.sortOrder || 'desc';
    }

    if (await useDatabase()) {
      try {
        const where: Prisma.ProductWhereInput = {};

        if (query.status) {
          where.isActive = query.status === 'ACTIVE';
        } else {
          where.isActive = true;
        }

        if (query.categoryId) {
          where.categoryId = query.categoryId;
        } else if (query.categorySlug) {
          where.category = { slug: query.categorySlug };
        }

        if (query.search) {
          where.OR = [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        if (query.minPrice !== undefined || query.maxPrice !== undefined) {
          where.price = {};
          if (query.minPrice !== undefined) where.price.gte = Number(query.minPrice);
          if (query.maxPrice !== undefined) where.price.lte = Number(query.maxPrice);
        }

        if (query.inStockOnly) {
          where.stock = { gt: 0 };
        }

        const orderBy: Prisma.ProductOrderByWithRelationInput = {
          [sortField]: sortDir,
        };

        const [products, total] = await Promise.all([
          prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy,
            include: {
              category: true,
              images: true,
            },
          }),
          prisma.product.count({ where }),
        ]);

        if (products && products.length > 0) {
          const totalPages = Math.ceil(total / limit) || 1;
          return {
            success: true,
            data: products.map((p) => this.formatProduct(p)),
            meta: {
              page,
              limit,
              total,
              totalPages,
            },
            total,
            page,
            limit,
            totalPages,
          };
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    // In-memory fallback
    let filtered = [...this.localProducts];

    if (query.status) {
      const activeBool = query.status === 'ACTIVE';
      filtered = filtered.filter((p) => p.isActive === activeBool);
    } else {
      filtered = filtered.filter((p) => p.isActive);
    }

    if (query.categoryId) {
      filtered = filtered.filter((p) => p.categoryId === query.categoryId);
    } else if (query.categorySlug) {
      filtered = filtered.filter((p) => p.category?.slug === query.categorySlug);
    }

    if (query.search) {
      const s = query.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.description.toLowerCase().includes(s) ||
          p.sku.toLowerCase().includes(s),
      );
    }

    if (query.minPrice !== undefined) {
      filtered = filtered.filter((p) => p.price >= Number(query.minPrice));
    }
    if (query.maxPrice !== undefined) {
      filtered = filtered.filter((p) => p.price <= Number(query.maxPrice));
    }
    if (query.inStockOnly) {
      filtered = filtered.filter((p) => p.stock > 0);
    }

    filtered.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(idOrSlug: string): Promise<ProductDto> {
    if (await useDatabase()) {
      try {
        const product = await prisma.product.findFirst({
          where: {
            OR: [{ id: idOrSlug }, { slug: idOrSlug }],
          },
          include: {
            category: true,
            images: true,
          },
        });

        if (product) {
          return this.formatProduct(product);
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    const fallback = this.localProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
    if (!fallback) {
      throw new NotFoundException(`Product '${idOrSlug}' not found`);
    }

    return fallback;
  }

  async findBySlug(slug: string): Promise<ProductDto> {
    return this.findById(slug);
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (await useDatabase()) {
      try {
        const existingSku = await prisma.product.findUnique({ where: { sku: dto.sku } });
        if (existingSku) {
          throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
        }

        const { images, attributes, ...rest } = dto;
        const created = await prisma.product.create({
          data: {
            ...rest,
            slug,
            attributes: (attributes as any) || {},
            images: images
              ? {
                  create: images.map((img) => ({
                    url: img.url,
                    isPrimary: img.isPrimary ?? false,
                    altText: img.altText,
                  })),
                }
              : undefined,
          },
          include: {
            category: true,
            images: true,
          },
        });

        return this.formatProduct(created);
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof ConflictException) throw err;
      }
    }

    // In-memory check
    const existingSku = this.localProducts.find((p) => p.sku === dto.sku);
    if (existingSku) {
      throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
    }

    const newProd: ProductDto = {
      id: `prod-${Date.now()}`,
      name: dto.name,
      slug,
      sku: dto.sku,
      description: dto.description,
      price: dto.price,
      discountPercentage: dto.discountPercentage || 0,
      stock: dto.stock,
      categoryId: dto.categoryId,
      category: SEED_CATEGORIES.find((c) => c.id === dto.categoryId),
      images: (dto.images || []).map((img, i) => ({
        id: `img-${i}`,
        url: img.url,
        isPrimary: img.isPrimary ?? false,
        altText: img.altText,
      })),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      attributes: dto.attributes || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.localProducts.push(newProd);
    return newProd;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    await this.findById(id);

    if (await useDatabase()) {
      try {
        if (dto.sku) {
          const conflict = await prisma.product.findFirst({
            where: { sku: dto.sku, NOT: { id } },
          });
          if (conflict) {
            throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
          }
        }

        const { images, attributes, ...rest } = dto;
        const updated = await prisma.product.update({
          where: { id },
          data: {
            ...rest,
            attributes: attributes ? (attributes as any) : undefined,
          },
          include: {
            category: true,
            images: true,
          },
        });

        return this.formatProduct(updated);
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof ConflictException) throw err;
      }
    }

    const index = this.localProducts.findIndex((p) => p.id === id || p.slug === id);
    if (index === -1) throw new NotFoundException(`Product '${id}' not found`);

    if (dto.sku) {
      const conflict = this.localProducts.find((p) => p.sku === dto.sku && p.id !== this.localProducts[index].id);
      if (conflict) {
        throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
      }
    }

    const existing = this.localProducts[index];
    const updated: ProductDto = {
      ...existing,
      name: dto.name ?? existing.name,
      description: dto.description ?? existing.description,
      sku: dto.sku ?? existing.sku,
      price: dto.price ?? existing.price,
      discountPercentage: dto.discountPercentage !== undefined ? dto.discountPercentage : existing.discountPercentage,
      stock: dto.stock !== undefined ? dto.stock : existing.stock,
      categoryId: dto.categoryId ?? existing.categoryId,
      isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
      attributes: dto.attributes ? { ...existing.attributes, ...dto.attributes } : existing.attributes,
      updatedAt: new Date().toISOString(),
    };

    this.localProducts[index] = updated;
    return updated;
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const product = await this.findById(id);

    if (await useDatabase()) {
      try {
        await prisma.product.update({
          where: { id: product.id },
          data: { isActive: false },
        });
        return { success: true, message: `Product '${product.name}' removed successfully` };
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    const index = this.localProducts.findIndex((p) => p.id === product.id);
    if (index !== -1) {
      this.localProducts[index].isActive = false;
    }
    return { success: true, message: `Product '${product.name}' removed successfully` };
  }

  // Backward compatibility for existing endpoints
  async getCategories(): Promise<CategoryDto[]> {
    if (await useDatabase()) {
      try {
        const categories = await prisma.category.findMany({
          orderBy: { name: 'asc' },
        });
        if (categories && categories.length > 0) {
          return categories.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description || undefined,
            parentId: c.parentId,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          }));
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }
    return SEED_CATEGORIES;
  }

  private formatProduct(p: any): ProductDto {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      price: p.price,
      discountPercentage: p.discountPercentage,
      stock: p.stock,
      categoryId: p.categoryId,
      category: p.category
        ? {
            id: p.category.id,
            name: p.category.name,
            slug: p.category.slug,
            description: p.category.description,
            parentId: p.category.parentId,
            createdAt: p.category.createdAt.toISOString(),
            updatedAt: p.category.updatedAt.toISOString(),
          }
        : undefined,
      images: (p.images || []).map((img: any) => ({
        id: img.id,
        url: img.url,
        isPrimary: img.isPrimary,
        altText: img.altText,
        storageKey: img.storageKey,
        mimeType: img.mimeType,
        fileSize: img.fileSize,
      })),
      isActive: p.isActive,
      attributes: (p.attributes as any) || {},
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    altText?: string,
    isPrimary?: boolean,
  ) {
    const product = await this.findById(productId);
    const uploadResult = await this.storageService.uploadProductImage(product.id, file);

    if (await useDatabase()) {
      try {
        const count = await prisma.productImage.count({ where: { productId: product.id } });
        const shouldBePrimary = isPrimary !== undefined ? isPrimary : count === 0;

        if (shouldBePrimary) {
          await prisma.productImage.updateMany({
            where: { productId: product.id, isPrimary: true },
            data: { isPrimary: false },
          });
        }

        const imageRecord = await prisma.productImage.create({
          data: {
            productId: product.id,
            url: `/api/v1/products/${product.id}/images/temp`,
            storageKey: uploadResult.storageKey,
            mimeType: uploadResult.mimeType,
            fileSize: uploadResult.fileSize,
            altText: altText || null,
            isPrimary: shouldBePrimary,
          },
        });

        const finalUrl = `/api/v1/products/${product.id}/images/${imageRecord.id}/file`;
        const updated = await prisma.productImage.update({
          where: { id: imageRecord.id },
          data: { url: finalUrl },
        });

        return {
          id: updated.id,
          productId: updated.productId,
          url: updated.url,
          isPrimary: updated.isPrimary,
          altText: updated.altText,
          storageKey: updated.storageKey,
          mimeType: updated.mimeType,
          fileSize: updated.fileSize,
          createdAt: updated.createdAt.toISOString(),
        };
      } catch (err) {
        rethrowInProduction(err);
      }
    }

    const imageId = 'img-' + Date.now();
    const finalUrl = `/api/v1/products/${product.id}/images/${imageId}/file`;
    const newImage = {
      id: imageId,
      productId: product.id,
      url: finalUrl,
      isPrimary: isPrimary !== undefined ? isPrimary : true,
      altText: altText || undefined,
      storageKey: uploadResult.storageKey,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.fileSize,
      createdAt: new Date().toISOString(),
    };

    if (newImage.isPrimary && product.images) {
      product.images.forEach((img) => (img.isPrimary = false));
    }
    if (!product.images) product.images = [];
    product.images.push(newImage);

    return newImage;
  }

  async getImages(productId: string) {
    const product = await this.findById(productId);
    if (await useDatabase()) {
      try {
        const images = await prisma.productImage.findMany({
          where: { productId: product.id },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        });
        return images.map((img) => ({
          id: img.id,
          productId: img.productId,
          url: img.url,
          isPrimary: img.isPrimary,
          altText: img.altText,
          storageKey: img.storageKey,
          mimeType: img.mimeType,
          fileSize: img.fileSize,
          createdAt: img.createdAt.toISOString(),
        }));
      } catch (err) {
        rethrowInProduction(err);
      }
    }

    return (product.images || []).map((img) => ({
      ...img,
      productId: product.id,
      createdAt: new Date().toISOString(),
    }));
  }

  async getImage(productId: string, imageId: string) {
    const product = await this.findById(productId);
    if (await useDatabase()) {
      try {
        const image = await prisma.productImage.findFirst({
          where: { id: imageId, productId: product.id },
        });
        if (!image) throw new NotFoundException(`Product image '${imageId}' not found`);
        return {
          id: image.id,
          productId: image.productId,
          url: image.url,
          isPrimary: image.isPrimary,
          altText: image.altText,
          storageKey: image.storageKey,
          mimeType: image.mimeType,
          fileSize: image.fileSize,
          createdAt: image.createdAt.toISOString(),
        };
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof NotFoundException) throw err;
      }
    }

    const img = product.images?.find((i) => i.id === imageId);
    if (!img) throw new NotFoundException(`Product image '${imageId}' not found`);
    return { ...img, productId: product.id, createdAt: new Date().toISOString() };
  }

  async getImageStream(productId: string, imageId: string) {
    const image = await this.getImage(productId, imageId);
    if (!image.storageKey) {
      throw new NotFoundException(`Image '${imageId}' does not have an associated storage object`);
    }
    return this.storageService.getFileStream(image.storageKey);
  }

  async getImageSignedUrl(productId: string, imageId: string, expiresInMinutes = 15) {
    const image = await this.getImage(productId, imageId);
    if (!image.storageKey) {
      return { url: image.url, signed: false };
    }
    const signedUrl = await this.storageService.getSignedUrl(image.storageKey, expiresInMinutes);
    return {
      url: signedUrl,
      signed: !signedUrl.startsWith('/api/v1/'),
      storageKey: image.storageKey,
      expiresInMinutes,
    };
  }

  async setPrimaryImage(productId: string, imageId: string) {
    const product = await this.findById(productId);
    if (await useDatabase()) {
      try {
        const image = await prisma.productImage.findFirst({
          where: { id: imageId, productId: product.id },
        });
        if (!image) throw new NotFoundException(`Product image '${imageId}' not found`);

        await prisma.$transaction([
          prisma.productImage.updateMany({
            where: { productId: product.id, isPrimary: true },
            data: { isPrimary: false },
          }),
          prisma.productImage.update({
            where: { id: imageId },
            data: { isPrimary: true },
          }),
        ]);

        return { success: true, message: `Image '${imageId}' set as primary` };
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof NotFoundException) throw err;
      }
    }

    return { success: true, message: `Image '${imageId}' set as primary` };
  }

  async deleteImage(productId: string, imageId: string) {
    const product = await this.findById(productId);
    if (await useDatabase()) {
      try {
        const image = await prisma.productImage.findFirst({
          where: { id: imageId, productId: product.id },
        });
        if (!image) throw new NotFoundException(`Product image '${imageId}' not found`);

        // Delete from GCS/storage
        if (image.storageKey) {
          await this.storageService.deleteFile(image.storageKey);
        }

        // Delete from database
        await prisma.productImage.delete({ where: { id: imageId } });

        // If deleted image was primary, reassign primary to the first remaining image
        if (image.isPrimary) {
          const remaining = await prisma.productImage.findFirst({
            where: { productId: product.id },
            orderBy: { createdAt: 'asc' },
          });
          if (remaining) {
            await prisma.productImage.update({
              where: { id: remaining.id },
              data: { isPrimary: true },
            });
          }
        }

        return { success: true, message: `Image '${imageId}' deleted successfully` };
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof NotFoundException) throw err;
      }
    }

    return { success: true, message: `Image '${imageId}' deleted successfully` };
  }
}
