import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { CategoryDto } from '@shopcloud/contracts';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { useDatabase } from '../../db-status';
import { rethrowInProduction } from '../../common/runtime-mode';

const SEED_CATEGORIES: CategoryDto[] = [
  {
    id: 'cat-smartphones',
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'Next-generation flagship smartphones and mobile devices',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-laptops',
    name: 'Laptops',
    slug: 'laptops',
    description: 'High-performance laptops for creators, professionals and developers',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-audio',
    name: 'Audio & Wearables',
    slug: 'audio',
    description: 'Noise cancelling headphones, earbuds and smart accessories',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

@Injectable()
export class CategoriesService {
  private localCategories: CategoryDto[] = [...SEED_CATEGORIES];

  async findAll(): Promise<CategoryDto[]> {
    if (await useDatabase()) {
      try {
        const categories = await prisma.category.findMany({
          orderBy: { name: 'asc' },
        });
        if (categories && categories.length > 0) {
          return categories.map((c) => this.formatCategory(c));
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback to localCategories
      }
    }
    return this.localCategories;
  }

  async findById(id: string): Promise<CategoryDto> {
    if (await useDatabase()) {
      try {
        const category = await prisma.category.findFirst({
          where: {
            OR: [{ id }, { slug: id }],
          },
        });
        if (category) {
          return this.formatCategory(category);
        }
      } catch (err) {
        rethrowInProduction(err);
        // Fallback
      }
    }

    const found = this.localCategories.find((c) => c.id === id || c.slug === id);
    if (!found) {
      throw new NotFoundException(`Category '${id}' not found`);
    }
    return found;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const slug = dto.slug || this.slugify(dto.name);

    if (await useDatabase()) {
      try {
        const existing = await prisma.category.findUnique({ where: { slug } });
        if (existing) {
          throw new ConflictException(`Category with slug '${slug}' already exists`);
        }

        const created = await prisma.category.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description,
            parentId: dto.parentId,
          },
        });
        return this.formatCategory(created);
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof ConflictException) throw err;
      }
    }

    // In-memory check
    const existing = this.localCategories.find((c) => c.slug === slug);
    if (existing) {
      throw new ConflictException(`Category with slug '${slug}' already exists`);
    }

    const newCategory: CategoryDto = {
      id: `cat-${Date.now()}`,
      name: dto.name,
      slug,
      description: dto.description,
      status: dto.status || 'ACTIVE',
      parentId: dto.parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.localCategories.push(newCategory);
    return newCategory;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    await this.findById(id);

    const slug = dto.slug ? this.slugify(dto.slug) : undefined;

    if (await useDatabase()) {
      try {
        if (slug) {
          const conflict = await prisma.category.findFirst({
            where: { slug, NOT: { id } },
          });
          if (conflict) {
            throw new ConflictException(`Category with slug '${slug}' already exists`);
          }
        }

        const updated = await prisma.category.update({
          where: { id },
          data: {
            name: dto.name,
            slug,
            description: dto.description,
            parentId: dto.parentId,
          },
        });
        return this.formatCategory(updated);
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof ConflictException) throw err;
      }
    }

    const index = this.localCategories.findIndex((c) => c.id === id || c.slug === id);
    if (index === -1) throw new NotFoundException(`Category '${id}' not found`);

    if (slug) {
      const conflict = this.localCategories.find((c) => c.slug === slug && c.id !== this.localCategories[index].id);
      if (conflict) {
        throw new ConflictException(`Category with slug '${slug}' already exists`);
      }
    }

    const existing = this.localCategories[index];
    const updated: CategoryDto = {
      ...existing,
      name: dto.name ?? existing.name,
      slug: slug ?? existing.slug,
      description: dto.description ?? existing.description,
      status: dto.status ?? existing.status,
      parentId: dto.parentId !== undefined ? dto.parentId : existing.parentId,
      updatedAt: new Date().toISOString(),
    };
    this.localCategories[index] = updated;
    return updated;
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const category = await this.findById(id);

    if (await useDatabase()) {
      try {
        const productCount = await prisma.product.count({
          where: { categoryId: category.id },
        });
        if (productCount > 0) {
          throw new ConflictException(
            `Cannot delete category '${category.name}' because ${productCount} products are associated with it`,
          );
        }

        await prisma.category.delete({ where: { id: category.id } });
        return { success: true, message: `Category '${category.name}' deleted successfully` };
      } catch (err) {
        rethrowInProduction(err);
        if (err instanceof ConflictException) throw err;
      }
    }

    // In-memory check (demo products associated with default categories)
    if (['cat-smartphones', 'cat-laptops', 'cat-audio'].includes(category.id)) {
      throw new ConflictException(
        `Cannot delete category '${category.name}' because products are currently assigned to it`,
      );
    }

    this.localCategories = this.localCategories.filter((c) => c.id !== category.id);
    return { success: true, message: `Category '${category.name}' deleted successfully` };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private formatCategory(c: any): CategoryDto {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || undefined,
      status: 'ACTIVE',
      parentId: c.parentId,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    };
  }
}
