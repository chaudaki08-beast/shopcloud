import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { prisma } from '@shopcloud/database';
import { UserRole } from '@shopcloud/contracts';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'shopcloud-default-secret-change-me',
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // Quick demo user bypass for local development
    if (payload.sub === 'user-admin') {
      return {
        id: 'user-admin',
        email: 'admin@shopcloud.dev',
        firstName: 'Cloud',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
      };
    }

    if (payload.sub === 'user-customer') {
      return {
        id: 'user-customer',
        email: 'customer@shopcloud.dev',
        firstName: 'Ganesh',
        lastName: 'Patil',
        role: UserRole.CUSTOMER,
      };
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (user && user.isActive) {
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        };
      }
    } catch {
      // database offline
    }

    return {
      id: payload.sub,
      email: payload.email,
      firstName: 'Customer',
      lastName: 'User',
      role: (payload.role as UserRole) || UserRole.CUSTOMER,
    };
  }
}
