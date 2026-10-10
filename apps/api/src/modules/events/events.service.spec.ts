import { EventsService } from './events.service';
import { EventEnvelope, EVENT_TYPES } from '@shopcloud/contracts';

describe('EventsService', () => {
  let eventsService: EventsService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    eventsService = new EventsService();
    eventsService.onModuleInit();
  });

  afterEach(async () => {
    await eventsService.onModuleDestroy();
  });

  it('should initialize in in-memory mode when NODE_ENV is test', () => {
    expect(eventsService.isPubSubActive).toBe(false);
  });

  it('should publish an event envelope into in-memory store', async () => {
    const envelope: EventEnvelope<any> = {
      eventId: 'evt-101',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId: 'corr-101',
      aggregateType: 'Order',
      aggregateId: 'ord-101',
      payload: { orderId: 'ord-101', totalAmount: 5000 },
    };

    const result = await eventsService.publishEnvelope(envelope);
    expect(result).toBe('evt-101');

    const published = eventsService.getPublishedEvents();
    expect(published).toHaveLength(1);
    expect(published[0].eventId).toBe('evt-101');
    expect(published[0].correlationId).toBe('corr-101');
    expect(published[0].aggregateId).toBe('ord-101');
  });

  it('should notify registered listeners when an event is published', async () => {
    const listener = jest.fn();
    const unsubscribe = eventsService.registerListener(EVENT_TYPES.ORDER_CREATED_V1, listener);

    const envelope: EventEnvelope<any> = {
      eventId: 'evt-102',
      eventType: EVENT_TYPES.ORDER_CREATED_V1,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      producer: 'shopcloud-api',
      correlationId: 'corr-102',
      aggregateType: 'Order',
      aggregateId: 'ord-102',
      payload: { orderId: 'ord-102' },
    };

    await eventsService.publishEnvelope(envelope);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(envelope);

    unsubscribe();
    await eventsService.publishEnvelope(envelope);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should support backward-compatible publish method', async () => {
    const messageId = await eventsService.publish(
      'order-created',
      { orderId: 'ord-legacy-1', amount: 100 },
      'shopcloud.order.created',
      'corr-legacy-1',
    );

    expect(messageId).toMatch(/^evt-/);
    const published = eventsService.getPublishedEvents();
    expect(published).toHaveLength(1);
    expect(published[0].correlationId).toBe('corr-legacy-1');
  });
});
