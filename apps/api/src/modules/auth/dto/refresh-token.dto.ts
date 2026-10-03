import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Cryptographic refresh token string' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token must not be empty' })
  refreshToken!: string;
}
