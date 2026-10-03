import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShippingAddressInputDto {
  @ApiProperty({ example: 'Ganesh Chaudaki' })
  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: '123 Cloud Avenue, Tech Park' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'Bengaluru' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Karnataka' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '560001' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: 'India' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: ShippingAddressInputDto, description: 'Destination shipping address' })
  @ValidateNested()
  @Type(() => ShippingAddressInputDto)
  shippingAddress: ShippingAddressInputDto;

  @ApiPropertyOptional({ example: 'SANDBOX_STRIPE', default: 'SANDBOX_STRIPE' })
  @IsString()
  @IsOptional()
  paymentMethod?: string = 'SANDBOX_STRIPE';

  @ApiPropertyOptional({ example: 'Please leave at front door' })
  @IsString()
  @IsOptional()
  notes?: string;
}
