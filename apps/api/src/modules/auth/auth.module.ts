import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthRateLimiterGuard } from './guards/auth-rate-limiter.guard';
import { requiredSecret } from '../../common/runtime-mode';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: requiredSecret(['JWT_ACCESS_SECRET', 'JWT_SECRET'], 'shopcloud-default-secret-change-me'),
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PermissionsService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    AuthRateLimiterGuard,
  ],
  exports: [
    AuthService,
    PermissionsService,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    AuthRateLimiterGuard,
  ],
})
export class AuthModule {}
