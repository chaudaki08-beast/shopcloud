import { PrismaClient } from '@shopcloud/database';
import { PubSub } from '@google-cloud/pubsub';
import { OAuth2Client } from 'google-auth-library';
import { execSync } from 'child_process';
import {
  EVENT_TYPES,
  EventEnvelope,
  OrderCreatedPayload,
  NotificationRequestedPayload,
} from '@shopcloud/contracts';
import { InventoryWorker } from '../src/inventory-worker';
import { NotificationWorker } from '../src/notification-worker';
import { WorkerEventPublisher } from '../src/event-publisher';

delete process.env.PUBSUB_EMULATOR_HOST;

let authClient: OAuth2Client | undefined;
try {
  const token = execSync('gcloud auth print-access-token', { stdio: ['pipe', 'pipe', 'ignore'] })
    .toString()
    .trim();
  if (token) {
    authClient = new OAuth2Client();
    authClient.setCredentials({ access_token: token });
  }
} catch {
  // If gcloud is not available, default credentials will be used
}

const prisma = new PrismaClient();
const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'project-c3f386b1-6c37-468d-8ee',
  ...(authClient ? { authClient: authClient as any } : {}),
});
WorkerEventPublisher.setPubSub(pubsub);

async function main() {
  console.log('====================================================');
  console.log('SHOPCLOUD — PHASE 10 LIVE GCP & WORKERS VALIDATION');
  console.log('====================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  let testUserId: string | null = null;
  let testCategoryId: string | null = null;
  let testProductId: string | null = null;
  let testOrderId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Cloud SQL Database Connectivity & Schema Inspection
    // -------------------------------------------------------------------------
    console.log('[TEST 1/10] Verifying Cloud SQL connection & Phase 10 tables...');
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('OutboxEvent', 'ProcessedEvent', 'Notification')
    `;
    const tableNames = result.map((r) => r.table_name);
    if (
      tableNames.includes('OutboxEvent') &&
      tableNames.includes('ProcessedEvent') &&
      tableNames.includes('Notification')
    ) {
      console.log('  ✅ Cloud SQL schema has OutboxEvent, ProcessedEvent, and Notification tables.');
      passedTests++;
    } else {
      throw new Error(`Missing expected tables in Cloud SQL: found ${JSON.stringify(tableNames)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Pub/Sub Infrastructure Verification on GCP
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2/10] Verifying GCP Pub/Sub Topics & Subscriptions...');
    const [topics] = await pubsub.getTopics();
    const topicNames = topics.map((t) => t.name.split('/').pop());
    const requiredTopics = ['shopcloud-domain-events', 'shopcloud-inventory-dlq', 'shopcloud-notification-dlq'];
    for (const reqTopic of requiredTopics) {
      if (!topicNames.includes(reqTopic)) {
        throw new Error(`Pub/Sub topic ${reqTopic} not found in GCP project`);
      }
    }
    console.log('  ✅ All 3 Pub/Sub topics confirmed in GCP:', requiredTopics.join(', '));

    const [subs] = await pubsub.getSubscriptions();
    const subNames = subs.map((s) => s.name.split('/').pop());
    const requiredSubs = [
      'shopcloud-inventory-sub',
      'shopcloud-notification-sub',
      'shopcloud-inventory-dlq-sub',
      'shopcloud-notification-dlq-sub',
    ];
    for (const reqSub of requiredSubs) {
      if (!subNames.includes(reqSub)) {
        throw new Error(`Pub/Sub subscription ${reqSub} not found in GCP project`);
      }
    }
    console.log('  ✅ All 4 Pub/Sub subscriptions confirmed in GCP:', requiredSubs.join(', '));
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Setup Test Fixtures (User, Category, Product with initial stock)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3/10] Setting up test fixtures in Cloud SQL...');
    const testEmail = `phase10-test-${Date.now()}@shopcloud.dev`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: '$2a$10$FakeHashedPasswordForTestOnly9999999999999999999999',
        firstName: 'Phase10',
        lastName: 'Tester',
        role: 'CUSTOMER',
      },
    });
    testUserId = user.id;

    const category = await prisma.category.create({
      data: {
        name: `Test Cat ${Date.now()}`,
        slug: `test-cat-${Date.now()}`,
      },
    });
    testCategoryId = category.id;

    const initialStock = 50;
    const product = await prisma.product.create({
      data: {
        name: 'Event-Driven Test Gizmo',
        description: 'A test product for event-driven pipeline validation',
        slug: `test-gizmo-${Date.now()}`,
        sku: `SKU-TEST-${Date.now()}`,
        price: 250000, // 2500 INR in paise
        stock: initialStock,
        categoryId: category.id,
      },
    });
    testProductId = product.id;
    console.log(`  ✅ Fixtures ready. Product stock initialized to ${initialStock}.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Transactional Order Creation & OutboxEvent Persistence
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4/10] Placing Order and recording OutboxEvent atomically...');
    const orderNumber = `ORD-P10-${Date.now().toString().slice(-6)}`;
    const eventId = `evt-order-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const orderQuantity = 3;

    const orderCreatedPayload: OrderCreatedPayload = {
      orderId: '', // populated in tx
      orderNumber,
      userId: user.id,
      userEmail: user.email,
      totalAmount: 750000,
      currency: 'INR',
      items: [
        {
          productId: product.id,
          sku: product.sku,
          quantity: orderQuantity,
          unitPrice: product.price,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    const txResult = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          subtotal: 750000,
          grandTotal: 750000,
          currency: 'INR',
          shippingAddress: { city: 'Mumbai', street: '123 Cloud Way' },
          status: 'PAYMENT_PENDING',
          items: {
            create: [
              {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                quantity: orderQuantity,
                unitPrice: product.price,
                lineTotal: 750000,
              },
            ],
          },
        },
      });

      orderCreatedPayload.orderId = order.id;

      const outbox = await tx.outboxEvent.create({
        data: {
          eventId,
          eventType: EVENT_TYPES.ORDER_CREATED_V1,
          eventVersion: 'v1',
          aggregateType: 'Order',
          aggregateId: order.id,
          payload: orderCreatedPayload as any,
          correlationId,
          status: 'PENDING',
          attempts: 0,
        },
      });

      return { order, outbox };
    });

    testOrderId = txResult.order.id;

    // Verify outbox record
    const outboxRecord = await prisma.outboxEvent.findUnique({ where: { eventId } });
    if (outboxRecord && outboxRecord.status === 'PENDING') {
      console.log(`  ✅ Atomic transaction committed Order [${orderNumber}] & OutboxEvent [${eventId}] with status PENDING.`);
      passedTests++;
    } else {
      throw new Error('OutboxEvent was not created in PENDING state');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Outbox Dispatch to GCP Pub/Sub with Ordering Key
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5/10] Dispatching OutboxEvent to GCP Pub/Sub topic...');
    const topic = pubsub.topic('shopcloud-domain-events');
    const envelope: EventEnvelope<OrderCreatedPayload> = {
      eventId,
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId,
      aggregateType: 'Order',
      aggregateId: testOrderId,
      payload: orderCreatedPayload,
    };

    const messageBuffer = Buffer.from(JSON.stringify(envelope));
    const pubsubMessageId = await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        eventType: envelope.eventType,
        eventVersion: envelope.eventVersion,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        correlationId: envelope.correlationId,
      },
      orderingKey: envelope.aggregateId,
    });

    await prisma.outboxEvent.update({
      where: { eventId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        attempts: 1,
      },
    });

    console.log(`  ✅ Published to GCP topic [shopcloud-domain-events] (Pub/Sub MessageId: ${pubsubMessageId}).`);
    console.log(`  ✅ OutboxEvent [${eventId}] status updated to PUBLISHED in Cloud SQL.`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Inventory Worker Processing & Stock Decrement
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6/10] Inventory Worker processing OrderCreated event...');
    const invResult = await InventoryWorker.handleOrderCreated(envelope);
    if (invResult.status !== 'SUCCESS' || !invResult.reserved) {
      throw new Error(`InventoryWorker failed: ${JSON.stringify(invResult)}`);
    }

    // Verify product stock in Cloud SQL
    const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    const expectedStock = initialStock - orderQuantity;
    if (updatedProduct?.stock !== expectedStock) {
      throw new Error(`Stock mismatch: expected ${expectedStock}, found ${updatedProduct?.stock}`);
    }

    // Verify InventoryMovement audit record
    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, referenceId: testOrderId },
    });
    if (!movement || movement.changeQuantity !== -orderQuantity) {
      throw new Error('InventoryMovement audit log record missing or incorrect');
    }
    console.log(`  ✅ Inventory Worker atomically decremented stock: ${initialStock} -> ${updatedProduct.stock}.`);
    console.log(`  ✅ InventoryMovement logged (reason: ORDER_RESERVED, change: -${orderQuantity}).`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Durable Idempotency Ledger Check (ProcessedEvent)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7/10] Checking ProcessedEvent ledger in Cloud SQL...');
    const processedRecord = await prisma.processedEvent.findUnique({
      where: {
        eventId_consumer: {
          eventId,
          consumer: InventoryWorker.CONSUMER_NAME,
        },
      },
    });
    if (!processedRecord) {
      throw new Error('ProcessedEvent ledger entry was not created');
    }
    console.log(`  ✅ ProcessedEvent recorded for eventId [${eventId}], consumer [${InventoryWorker.CONSUMER_NAME}].`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Replay Attack / Duplicate Event Handling (Idempotency Guard)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8/10] Simulating duplicate message delivery (replay guard)...');
    const replayResult = await InventoryWorker.handleOrderCreated(envelope);
    if (replayResult.status !== 'DUPLICATE_IGNORED') {
      throw new Error(`Expected DUPLICATE_IGNORED, received: ${replayResult.status}`);
    }

    // Verify stock was NOT decremented again
    const productAfterReplay = await prisma.product.findUnique({ where: { id: product.id } });
    if (productAfterReplay?.stock !== expectedStock) {
      throw new Error(`Stock changed after replay! expected ${expectedStock}, found ${productAfterReplay?.stock}`);
    }
    console.log('  ✅ Replayed event was safely ignored (DUPLICATE_IGNORED). Stock remained unchanged.');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 9: Notification Worker Processing & Database Record
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9/10] Notification Worker processing downstream event...');
    const notifEnvelope: EventEnvelope<NotificationRequestedPayload> = {
      eventId: `evt-notif-${Date.now()}`,
      eventType: EVENT_TYPES.NOTIFICATION_REQUESTED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-inventory-worker',
      correlationId,
      causationId: eventId,
      aggregateType: 'Notification',
      aggregateId: testOrderId,
      payload: {
        recipientEmail: user.email,
        recipientName: 'Phase 10 Tester',
        template: 'ORDER_CONFIRMATION',
        variables: { orderNumber, totalAmount: 7500 },
        orderId: testOrderId,
        correlationId,
      },
    };

    const notifResult = await NotificationWorker.handleNotification(notifEnvelope);
    if (notifResult.status !== 'SUCCESS' || !notifResult.notificationId) {
      throw new Error(`NotificationWorker failed: ${JSON.stringify(notifResult)}`);
    }

    // Verify Notification record in Cloud SQL
    const notificationDb = await prisma.notification.findUnique({
      where: { id: notifResult.notificationId },
    });
    if (!notificationDb || notificationDb.orderId !== testOrderId) {
      throw new Error('Notification record missing from Cloud SQL');
    }
    console.log(`  ✅ Notification Worker saved notification record [${notificationDb.id}] for order [${orderNumber}].`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 10: Dead-Letter Configuration & Subscription Policy Verification
    // -------------------------------------------------------------------------
    console.log('\n[TEST 10/10] Verifying GCP Dead-Letter Queue policies...');
    const invSub = pubsub.subscription('shopcloud-inventory-sub');
    const [invSubMetadata] = await invSub.getMetadata();

    const deadLetterPolicy = invSubMetadata.deadLetterPolicy;
    const maxAttempts = deadLetterPolicy?.maxDeliveryAttempts;
    const deadLetterTopic = deadLetterPolicy?.deadLetterTopic;

    if (!deadLetterTopic || !deadLetterTopic.includes('shopcloud-inventory-dlq') || maxAttempts !== 5) {
      throw new Error(`Unexpected DLQ policy on shopcloud-inventory-sub: ${JSON.stringify(deadLetterPolicy)}`);
    }
    console.log(`  ✅ Dead-Letter Policy verified: topic [${deadLetterTopic}], maxAttempts [${maxAttempts}].`);
    console.log('  ✅ Ordering Key enabled on subscription:', invSubMetadata.enableMessageOrdering === true);
    passedTests++;

  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('\nCleaning up Phase 10 test fixtures from Cloud SQL...');
    try {
      if (testOrderId) {
        await prisma.processedEvent.deleteMany({
          where: {
            eventId: { startsWith: 'evt-' },
          },
        });
        await prisma.outboxEvent.deleteMany({
          where: {
            aggregateId: testOrderId,
          },
        });
        await prisma.notification.deleteMany({
          where: {
            orderId: testOrderId,
          },
        });
        await prisma.inventoryMovement.deleteMany({
          where: {
            referenceId: testOrderId,
          },
        });
        await prisma.orderItem.deleteMany({
          where: {
            orderId: testOrderId,
          },
        });
        await prisma.order.deleteMany({
          where: {
            id: testOrderId,
          },
        });
      }
      if (testProductId) {
        await prisma.product.deleteMany({
          where: {
            id: testProductId,
          },
        });
      }
      if (testCategoryId) {
        await prisma.category.deleteMany({
          where: {
            id: testCategoryId,
          },
        });
      }
      if (testUserId) {
        await prisma.user.deleteMany({
          where: {
            id: testUserId,
          },
        });
      }
      console.log('  ✅ Test fixtures cleaned up successfully.');
    } catch (cleanupErr) {
      console.warn('  ⚠️ Fixture cleanup warning:', cleanupErr);
    }

    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`PHASE 10 LIVE GCP VALIDATION COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 10 Live Validation FAILED:', err);
  process.exit(1);
});
