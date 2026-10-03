import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCartItemDto {
  @ApiProperty({ example: 2, minimum: 1, description: 'Updated quantity (>= 1)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
