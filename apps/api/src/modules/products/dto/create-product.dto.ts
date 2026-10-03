import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductImageInputDto {
  @ApiProperty({ example: 'https://images.unsplash.com/photo-1610945265064' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: 'Front view' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  altText?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Google Pixel 9 Pro', description: 'Product title' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'PIX-9PRO-256-BLK', description: 'Unique Stock Keeping Unit' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  sku: string;

  @ApiProperty({ example: 'Obsidian, 256GB Storage, Google Tensor G4', description: 'Detailed product description' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(5000)
  description: string;

  @ApiProperty({ example: 10999900, description: 'Price in currency subunits (integer paise / cents)' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 10, description: 'Discount percentage between 0 and 100', default: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiProperty({ example: 50, description: 'Available stock count' })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiProperty({ example: 'cat-smartphones', description: 'Category identifier' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({ type: [ProductImageInputDto], description: 'Product images' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];

  @ApiPropertyOptional({ example: { color: 'Obsidian', storage: '256GB' } })
  @IsOptional()
  attributes?: Record<string, any>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
