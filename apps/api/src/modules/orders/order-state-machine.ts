import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@shopcloud/contracts';

export class InvalidOrderStateTransitionException extends ConflictException {
  constructor(fromStatus: OrderStatus, toStatus: OrderStatus) {
    super({
      code: 'ORDER_INVALID_STATE_TRANSITION',
      message: `Order cannot transition from ${fromStatus} to ${toStatus}`,
    });
  }
}

export class OrderStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.CART]: [OrderStatus.CHECKOUT, OrderStatus.CANCELLED],
    [OrderStatus.CHECKOUT]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
    [OrderStatus.PAYMENT_PENDING]: [
      OrderStatus.PAYMENT_SUCCESS,
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.PAYMENT_SUCCESS]: [
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.CONFIRMED]: [
      OrderStatus.PROCESSING,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.PROCESSING]: [
      OrderStatus.SHIPPED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.SHIPPED]: [
      OrderStatus.OUT_FOR_DELIVERY,
    ],
    [OrderStatus.OUT_FOR_DELIVERY]: [
      OrderStatus.DELIVERED,
    ],
    [OrderStatus.DELIVERED]: [
      OrderStatus.RETURN_REQUESTED,
    ],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.RETURN_REQUESTED]: [
      OrderStatus.RETURN_APPROVED,
    ],
    [OrderStatus.RETURN_APPROVED]: [
      OrderStatus.REFUNDED,
    ],
    [OrderStatus.REFUNDED]: [],
  };

  /**
   * Evaluates whether a transition from one status to another is permissible.
   */
  public static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    if (from === to) return true;
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  /**
   * Validates transition and throws InvalidOrderStateTransitionException (HTTP 409) if illegal.
   */
  public static validateTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidOrderStateTransitionException(from, to);
    }
  }

  /**
   * Returns list of allowed forward statuses from the current status.
   */
  public static getAllowedTransitions(from: OrderStatus): OrderStatus[] {
    return this.ALLOWED_TRANSITIONS[from] || [];
  }
}
