import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { prisma } from '@shopcloud/database';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminModule } from './modules/admin/admin.module';

/** Releases the shared Prisma connection pool when Cloud Run sends SIGTERM (enableShutdownHooks in main.ts). */
@Injectable()
export class PrismaShutdownHook implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await prisma.$disconnect();
  }
}

@Module({
  imports: [
    EventsModule,
    HealthModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    AdminModule,
  ],
  providers: [PrismaShutdownHook],
})
export class AppModule {}
