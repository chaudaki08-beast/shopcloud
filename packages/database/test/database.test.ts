import assert from 'node:assert';
import { prisma, OrderStatus } from '../src/index';

async function runDatabaseTests() {
  console.log('🧪 Starting @shopcloud/database integration tests...');

  // Test 1: Connectivity
  console.log('  Testing basic connectivity...');
  const ping = await prisma.$queryRaw<[{ result: number }]>`SELECT 1 as result`;
  assert.strictEqual(ping[0].result, 1, 'Database should answer ping query');
  console.log('  ✅ Connectivity verified.');

  // Test 2: Seed Verification
  console.log('  Verifying seeded categories and products...');
  const categoryCount = await prisma.category.count();
  assert(categoryCount >= 6, `Expected at least 6 categories, got ${categoryCount}`);

  const productCount = await prisma.product.count();
  assert(productCount >= 8, `Expected at least 8 products, got ${productCount}`);

  const userCount = await prisma.user.count();
  assert(userCount >= 3, `Expected at least 3 dev users, got ${userCount}`);

  const couponCount = await prisma.coupon.count();
  assert(couponCount >= 2, `Expected at least 2 coupons, got ${couponCount}`);
  console.log('  ✅ Seeded catalog and baseline records verified.');

  // Test 3: Relational Querying
  console.log('  Verifying relational queries (Product -> Category & Images)...');
  const laptop = await prisma.product.findFirst({
    where: { slug: 'macbook-pro-16-m4-max' },
    include: {
      category: true,
      images: true,
      inventoryMovements: true,
    },
  });

  assert(laptop !== null, 'MacBook Pro should exist in database');
  assert.strictEqual(laptop.category.slug, 'laptops', 'Category relation should resolve to laptops');
  assert(laptop.images.length > 0, 'Product should have associated images');
  assert(laptop.inventoryMovements.length > 0, 'Product should have initial inventory movement');
  console.log('  ✅ Relational queries verified.');

  // Test 4: Transactional Lifecycle (User -> Cart -> Order -> Payment -> OrderStatusHistory)
  console.log('  Testing full transactional lifecycle for Cart and Order...');
  const testEmail = `test-buyer-${Date.now()}@shopcloud.dev`;
  
  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash: 'dummy_hash',
      firstName: 'Integration',
      lastName: 'Tester',
      role: 'CUSTOMER',
    },
  });

  try {
    // Create Cart with item
    const cart = await prisma.cart.create({
      data: {
        userId: testUser.id,
        items: {
          create: {
            productId: laptop.id,
            quantity: 2,
          },
        },
      },
      include: {
        items: true,
      },
    });

    assert.strictEqual(cart.items.length, 1);
    assert.strictEqual(cart.items[0].quantity, 2);

    // Transactional Order Placement
    const orderNumber = `SC-TEST-${Date.now()}`;
    const subtotal = laptop.price * 2;
    const shippingFee = 0;
    const taxTotal = Math.round(subtotal * 0.18);
    const grandTotal = subtotal + shippingFee + taxTotal;

    const order = await prisma.$transaction(async (tx) => {
      // 1. Create Order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: testUser.id,
          status: OrderStatus.PAYMENT_PENDING,
          currency: 'INR',
          subtotal,
          shippingFee,
          taxTotal,
          discountTotal: 0,
          grandTotal,
          shippingAddress: {
            fullName: 'Integration Tester',
            addressLine1: '123 Cloud St',
            city: 'Bengaluru',
            state: 'Karnataka',
            postalCode: '560001',
            country: 'India',
          },
          items: {
            create: [
              {
                productId: laptop.id,
                productName: laptop.name,
                sku: laptop.sku,
                unitPrice: laptop.price,
                quantity: 2,
                discountAmount: 0,
                lineTotal: subtotal,
              },
            ],
          },
          statusHistory: {
            create: [
              {
                fromStatus: OrderStatus.CART,
                toStatus: OrderStatus.PAYMENT_PENDING,
                reason: 'Order created via test suite',
              },
            ],
          },
        },
        include: {
          items: true,
          statusHistory: true,
        },
      });

      // 2. Decrement Stock & Record Inventory Movement
      await tx.product.update({
        where: { id: laptop.id },
        data: { stock: { decrement: 2 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: laptop.id,
          changeQuantity: -2,
          previousStock: laptop.stock,
          newStock: laptop.stock - 2,
          reason: 'ORDER_FULFILLMENT',
          referenceId: newOrder.id,
        },
      });

      return newOrder;
    });

    assert.strictEqual(order.status, OrderStatus.PAYMENT_PENDING);
    assert.strictEqual(order.items.length, 1);
    assert.strictEqual(order.statusHistory.length, 1);
    assert.strictEqual(order.grandTotal, grandTotal);
    console.log('  ✅ Transactional Order placement verified.');

    // Transition Order status
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CONFIRMED,
        statusHistory: {
          create: {
            fromStatus: OrderStatus.PAYMENT_PENDING,
            toStatus: OrderStatus.CONFIRMED,
            reason: 'Payment confirmed in test',
          },
        },
      },
      include: {
        statusHistory: true,
      },
    });

    assert.strictEqual(updatedOrder.status, OrderStatus.CONFIRMED);
    assert.strictEqual(updatedOrder.statusHistory.length, 2);
    console.log('  ✅ Order status transition and audit history verified.');

    // Restore stock
    await prisma.product.update({
      where: { id: laptop.id },
      data: { stock: { increment: 2 } },
    });
  } finally {
    // Cleanup test user and cascaded/associated records
    await prisma.cartItem.deleteMany({
      where: { cart: { userId: testUser.id } },
    });
    await prisma.cart.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.paymentEvent.deleteMany({
      where: { payment: { order: { userId: testUser.id } } },
    });
    await prisma.payment.deleteMany({
      where: { order: { userId: testUser.id } },
    });
    await prisma.orderStatusHistory.deleteMany({
      where: { order: { userId: testUser.id } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { userId: testUser.id } },
    });
    await prisma.order.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { reason: 'ORDER_FULFILLMENT', referenceId: { contains: 'SC-TEST' } },
    });
    await prisma.user.delete({
      where: { id: testUser.id },
    });
    console.log('  ✅ Test data cleaned up.');
  }

  // Test 5: Foreign Key / Constraint Verification
  console.log('  Verifying Foreign Key constraints...');
  let constraintCaught = false;
  try {
    await prisma.product.create({
      data: {
        name: 'Invalid FK Product',
        slug: 'invalid-fk-product',
        sku: 'INV-FK-001',
        description: 'Should fail due to missing category',
        price: 100000,
        stock: 5,
        categoryId: 'non-existent-category-id',
      },
    });
  } catch (err: any) {
    constraintCaught = true;
    assert(
      err.code === 'P2003' || err.message.includes('Foreign key constraint'),
      'Should throw foreign key violation error'
    );
  }
  assert(constraintCaught, 'Database must enforce Foreign Key constraints');
  console.log('  ✅ Foreign Key constraint enforcement verified.');

  console.log('🎉 All @shopcloud/database integration tests passed successfully!');
}

runDatabaseTests()
  .catch((err) => {
    console.error('❌ Database integration tests failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
