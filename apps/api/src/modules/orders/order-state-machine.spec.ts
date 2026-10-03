import { OrderStateMachine, InvalidOrderStateTransitionException } from './order-state-machine';
import { OrderStatus } from '@shopcloud/contracts';

describe('OrderStateMachine Transition Matrix', () => {
  describe('Valid Lifecycle Transitions (PASS)', () => {
    it('CART -> CHECKOUT should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CART, OrderStatus.CHECKOUT)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CART, OrderStatus.CHECKOUT)).not.toThrow();
    });

    it('CHECKOUT -> PAYMENT_PENDING should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CHECKOUT, OrderStatus.PAYMENT_PENDING)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CHECKOUT, OrderStatus.PAYMENT_PENDING)).not.toThrow();
    });

    it('PAYMENT_PENDING -> PAYMENT_SUCCESS should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.PAYMENT_SUCCESS)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.PAYMENT_SUCCESS)).not.toThrow();
    });

    it('PAYMENT_PENDING -> CONFIRMED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED)).not.toThrow();
    });

    it('PAYMENT_SUCCESS -> CONFIRMED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PAYMENT_SUCCESS, OrderStatus.CONFIRMED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.PAYMENT_SUCCESS, OrderStatus.CONFIRMED)).not.toThrow();
    });

    it('CONFIRMED -> PROCESSING should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).not.toThrow();
    });

    it('PROCESSING -> SHIPPED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).not.toThrow();
    });

    it('SHIPPED -> OUT_FOR_DELIVERY should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY)).not.toThrow();
    });

    it('OUT_FOR_DELIVERY -> DELIVERED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).not.toThrow();
    });

    it('CONFIRMED -> CANCELLED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).not.toThrow();
    });

    it('DELIVERED -> RETURN_REQUESTED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED)).not.toThrow();
    });

    it('RETURN_REQUESTED -> RETURN_APPROVED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURN_APPROVED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURN_APPROVED)).not.toThrow();
    });

    it('RETURN_APPROVED -> REFUNDED should pass', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.RETURN_APPROVED, OrderStatus.REFUNDED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.RETURN_APPROVED, OrderStatus.REFUNDED)).not.toThrow();
    });

    it('idempotent same-state transitions should pass without modification', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CONFIRMED)).toBe(true);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.CONFIRMED)).not.toThrow();
    });
  });

  describe('Invalid Lifecycle Transitions (FAIL - HTTP 409 Conflict)', () => {
    it('DELIVERED -> CART should fail', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.DELIVERED, OrderStatus.CART)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.DELIVERED, OrderStatus.CART))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('DELIVERED -> PROCESSING should fail', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.DELIVERED, OrderStatus.PROCESSING)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.DELIVERED, OrderStatus.PROCESSING))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('CART -> SHIPPED should fail', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CART, OrderStatus.SHIPPED)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CART, OrderStatus.SHIPPED))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('PAYMENT_PENDING -> DELIVERED should fail', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.DELIVERED)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.DELIVERED))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('CONFIRMED -> CART should fail', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.CART)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.CART))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('CONFIRMED -> DELIVERED should fail (cannot skip processing & shipping)', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('CANCELLED -> PROCESSING should fail (terminal status)', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.CANCELLED, OrderStatus.PROCESSING)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.CANCELLED, OrderStatus.PROCESSING))
        .toThrow(InvalidOrderStateTransitionException);
    });

    it('REFUNDED -> SHIPPED should fail (terminal status)', () => {
      expect(OrderStateMachine.canTransition(OrderStatus.REFUNDED, OrderStatus.SHIPPED)).toBe(false);
      expect(() => OrderStateMachine.validateTransition(OrderStatus.REFUNDED, OrderStatus.SHIPPED))
        .toThrow(InvalidOrderStateTransitionException);
    });
  });

  describe('Allowed transitions query helper', () => {
    it('should return next allowed steps from CONFIRMED', () => {
      const allowed = OrderStateMachine.getAllowedTransitions(OrderStatus.CONFIRMED);
      expect(allowed).toContain(OrderStatus.PROCESSING);
      expect(allowed).toContain(OrderStatus.CANCELLED);
      expect(allowed).not.toContain(OrderStatus.DELIVERED);
    });
  });
});
