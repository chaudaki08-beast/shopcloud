import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_SORT_FIELDS = [
  'name',
  'price',
  'createdAt',
  'updatedAt',
  // Legacy aliases
  'price_asc',
  'price_desc',
  'name_asc',
  'created_at_desc',
] as const;

export type AllowedSortField = (typeof ALLOWED_SORT_FIELDS)[number];

export class ProductQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number (>= 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Items per page (1 to 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'cat-smartphones', description: 'Filter by category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'smartphones', description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ example: 'galaxy', description: 'Search name, description, or SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1000000, description: 'Minimum price filter in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 50000000, description: 'Maximum price filter in paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'], description: 'Product status' })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ example: true, description: 'Filter products with stock > 0' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  inStockOnly?: boolean;

  @ApiPropertyOptional({
    example: 'price',
    enum: ALLOWED_SORT_FIELDS,
    description: 'Sort field (allowlisted: name, price, createdAt, updatedAt)',
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_SORT_FIELDS)
  sortBy?: AllowedSortField;

  @ApiPropertyOptional({ example: 'asc', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
