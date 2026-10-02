import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma, Prisma } from '@shopcloud/database';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  PaginatedResult,
  ProductDto,
} from '@shopcloud/contracts';

@Injectable()
export class ProductsService {
  async findAll(query: ProductQueryDto): Promise<PaginatedResult<ProductDto>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

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

    const formattedData: ProductDto[] = products.map((p) => this.formatProduct(p));

    return {
      data: formattedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findBySlug(slug: string): Promise<ProductDto> {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug '${slug}' not found`);
    }

    return this.formatProduct(product);
  }

  async getCategories() {
    return prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProductDto): Promise<ProductDto> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const existing = await prisma.product.findFirst({
      where: {
        OR: [{ slug }, { sku: dto.sku }],
      },
    });

    if (existing) {
      throw new ConflictException('Product with this name or SKU already exists');
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
