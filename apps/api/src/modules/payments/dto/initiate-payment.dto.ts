import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({ description: 'Order UUID for which payment is being initiated' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiPropertyOptional({
    description: 'Payment provider adapter to use',
    enum: ['TEST_SANDBOX', 'RAZORPAY_SANDBOX', 'STRIPE_SANDBOX'],
    default: 'TEST_SANDBOX',
  })
  @IsOptional()
  @IsIn(['TEST_SANDBOX', 'RAZORPAY_SANDBOX', 'STRIPE_SANDBOX'])
  provider?: 'TEST_SANDBOX' | 'RAZORPAY_SANDBOX' | 'STRIPE_SANDBOX';

  @ApiPropertyOptional({ description: 'Client-supplied idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Return URL for redirection after payment completes' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
