import { OutboxService } from './outbox.service';
import { EventsService } from './events.service';
import { EventEnvelope, EVENT_TYPES } from '@shopcloud/contracts';
import { prisma } from '@shopcloud/database';

jest.mock('@shopcloud/database', () => ({
  prisma: {
    outboxEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../db-status', () => ({
  useDatabase: jest.fn().mockResolvedValue(true),
}));

describe('OutboxService', () => {
  let outboxService: OutboxService;
  let eventsService: EventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    eventsService = new EventsService();
    jest.spyOn(eventsService, 'publishEnvelope').mockResolvedValue('msg-published-1');
    outboxService = new OutboxService(eventsService);
  });

  afterEach(() => {
    outboxService.onModuleDestroy();
  });

  it('should record an event envelope within transaction client', async () => {
    const mockTx: any = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1', eventId: 'evt-1' }),
      },
    };

    const envelope: EventEnvelope<any> = {
      eventId: 'evt-1',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId: 'corr-1',
      aggregateType: 'Order',
      aggregateId: 'ord-1',
      payload: { orderId: 'ord-1' },
    };

    const result = await outboxService.recordEvent(mockTx, envelope);
    expect(result.id).toBe('outbox-1');
    expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'evt-1',
          eventType: EVENT_TYPES.ORDER_CREATED_V1,
          status: 'PENDING',
          correlationId: 'corr-1',
        }),
      }),
    );
  });

  it('should atomically claim and dispatch a pending outbox event', async () => {
    (prisma.outboxEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.outboxEvent.findUnique as jest.Mock).mockResolvedValue({
      id: 'outbox-1',
      eventId: 'evt-1',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      aggregateType: 'Order',
      aggregateId: 'ord-1',
      payload: { orderId: 'ord-1' },
      correlationId: 'corr-1',
      createdAt: new Date(),
      attempts: 0,
    });
    (prisma.outboxEvent.update as jest.Mock).mockResolvedValue({});

    const success = await outboxService.dispatchImmediate('evt-1');
    expect(success).toBe(true);

    // Verified atomic claim
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'evt-1', status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    // Verified publication
    expect(eventsService.publishEnvelope).toHaveBeenCalledTimes(1);

    // Verified published update
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
      }),
    });
  });

  it('should prevent double-dispatch when event is already claimed', async () => {
    (prisma.outboxEvent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const success = await outboxService.dispatchImmediate('evt-already-processing');
    expect(success).toBe(false);
    expect(eventsService.publishEnvelope).not.toHaveBeenCalled();
  });

  it('should schedule retry with backoff upon publication failure', async () => {
    (prisma.outboxEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.outboxEvent.findUnique as jest.Mock).mockResolvedValue({
      id: 'outbox-fail',
      eventId: 'evt-fail',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      aggregateType: 'Order',
      aggregateId: 'ord-fail',
      payload: {},
      createdAt: new Date(),
      attempts: 1,
    });
    jest.spyOn(eventsService, 'publishEnvelope').mockRejectedValue(new Error('Network timeout'));

    const success = await outboxService.dispatchImmediate('evt-fail');
    expect(success).toBe(false);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-fail' },
      data: expect.objectContaining({
        status: 'PENDING',
        attempts: 2,
        lastError: 'Network timeout',
      }),
    });
  });

  it('should mark event as FAILED when max attempts are exceeded', async () => {
    (prisma.outboxEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.outboxEvent.findUnique as jest.Mock).mockResolvedValue({
      id: 'outbox-poison',
      eventId: 'evt-poison',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      aggregateType: 'Order',
      aggregateId: 'ord-poison',
      payload: {},
      createdAt: new Date(),
      attempts: 4, // 5th attempt will exceed MAX_PUBLISH_ATTEMPTS (5)
    });
    jest.spyOn(eventsService, 'publishEnvelope').mockRejectedValue(new Error('Permanent failure'));

    const success = await outboxService.dispatchImmediate('evt-poison');
    expect(success).toBe(false);

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-poison' },
      data: expect.objectContaining({
        status: 'FAILED',
        attempts: 5,
        lastError: 'Permanent failure',
      }),
    });
  });
});
