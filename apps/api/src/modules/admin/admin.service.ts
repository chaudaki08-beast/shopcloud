import { Injectable } from '@nestjs/common';
import { prisma, Role } from '@shopcloud/database';

@Injectable()
export class AdminService {
  async getDashboardMetrics() {
    const [totalOrders, totalCustomers, totalProducts, lowStockProducts, recentOrders] =
      await Promise.all([
        prisma.order.count(),
        prisma.user.count({ where: { role: Role.CUSTOMER } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.findMany({
          where: {
            stock: { lte: 10 },
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            sku: true,
            stock: true,
          },
          take: 10,
        }),
        prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
      ]);

    const revenueAggregation = await prisma.order.aggregate({
      where: {
        status: {
          in: ['PAYMENT_SUCCESS', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'],
        },
      },
      _sum: {
        grandTotal: true,
      },
    });

    const totalRevenuePaise = revenueAggregation._sum.grandTotal || 0;

    return {
      overview: {
        totalOrders,
        totalRevenue: totalRevenuePaise / 100, // converted to ₹
        totalCustomers,
        totalProducts,
      },
      lowStockAlerts: lowStockProducts,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: `${o.user.firstName} ${o.user.lastName}`,
        customerEmail: o.user.email,
        total: o.grandTotal / 100,
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
}
