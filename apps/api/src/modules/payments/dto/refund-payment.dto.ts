import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsPositive, IsString } from 'class-validator';

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: 'Optional partial refund amount in integer paise' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'Reason for the refund' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency key for the refund request' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
