import { Module } from '@nestjs/common';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    EventsModule,
    HealthModule,
    AuthModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    AdminModule,
  ],
})
export class AppModule {}
