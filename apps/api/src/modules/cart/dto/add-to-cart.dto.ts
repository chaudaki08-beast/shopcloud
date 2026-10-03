import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AddToCartDto {
  @ApiProperty({ example: 'prod-s25-ultra', description: 'Product identifier' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 1, minimum: 1, description: 'Quantity to add' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
