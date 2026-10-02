import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma, Prisma } from '@shopcloud/database';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  PaginatedResult,
  ProductDto,
  CategoryDto,
} from '@shopcloud/contracts';

const DEFAULT_CATEGORIES: CategoryDto[] = [
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

const DEFAULT_PRODUCTS: ProductDto[] = [
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
    category: DEFAULT_CATEGORIES[0],
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
    category: DEFAULT_CATEGORIES[0],
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
    category: DEFAULT_CATEGORIES[1],
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
    category: DEFAULT_CATEGORIES[1],
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
    category: DEFAULT_CATEGORIES[2],
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
  async findAll(query: ProductQueryDto): Promise<PaginatedResult<ProductDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    try {
      const where: Prisma.ProductWhereInput = {
        isActive: true,
      };

      if (query.categorySlug) {
        where.category = {
          slug: query.categorySlug,
        };
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

      let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
      if (query.sortBy === 'price_asc') orderBy = { price: 'asc' };
      if (query.sortBy === 'price_desc') orderBy = { price: 'desc' };
      if (query.sortBy === 'name_asc') orderBy = { name: 'asc' };

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
        return {
          data: products.map((p) => this.formatProduct(p)),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      }
    } catch {
      // Fallback to default catalog if database is not yet seeded or offline
    }

    // Fallback seed catalog filter
    let filtered = [...DEFAULT_PRODUCTS];
    if (query.categorySlug) {
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
    if (query.sortBy === 'price_asc') filtered.sort((a, b) => a.price - b.price);
    if (query.sortBy === 'price_desc') filtered.sort((a, b) => b.price - a.price);
    if (query.sortBy === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));

    return {
      data: filtered,
      total: filtered.length,
      page: 1,
      limit: 12,
      totalPages: 1,
    };
  }

  async findBySlug(slug: string): Promise<ProductDto> {
    try {
      const product = await prisma.product.findUnique({
        where: { slug },
        include: {
          category: true,
          images: true,
        },
      });

      if (product) {
        return this.formatProduct(product);
      }
    } catch {
      // fallback
    }

    const fallback = DEFAULT_PRODUCTS.find((p) => p.slug === slug);
    if (!fallback) {
      throw new NotFoundException(`Product with slug '${slug}' not found`);
    }

    return fallback;
  }

  async getCategories(): Promise<CategoryDto[]> {
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
    } catch {
      // fallback
    }

    return DEFAULT_CATEGORIES;
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const { images, attributes, ...rest } = dto;

    try {
      const created = await prisma.product.create({
        data: {
          ...rest,
          slug,
          attributes: (attributes as any) || {},
          images: images
            ? {
                create: images.map((img) => ({
                  url: img.url,
                  isPrimary: img.isPrimary,
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
    } catch {
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
        images: (dto.images || []).map((img, i) => ({
          id: `img-${i}`,
          url: img.url,
          isPrimary: img.isPrimary,
          altText: img.altText,
        })),
        isActive: true,
        attributes: dto.attributes || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      DEFAULT_PRODUCTS.push(newProd);
      return newProd;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
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
  }

  async remove(id: string): Promise<{ success: boolean }> {
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
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
      })),
      isActive: p.isActive,
      attributes: (p.attributes as any) || {},
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
