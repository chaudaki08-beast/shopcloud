# Payment State Machine & Order Lifecycle Integration

## 1. Payment Lifecycle State Transitions

The `Payment` model implements finite status transitions aligned with `PaymentStatus`:

```
       [ Client Checkout ]
                |
                v
       +-----------------+
       |     PENDING     |<------+ (Idempotency Key reuse)
       +-----------------+
          |           |
          |           +-----------------------+
          | (Payment Captured)                | (Payment Failed / Rejected)
          v                                   v
  +---------------+                   +---------------+
  |    SUCCESS    |                   |    FAILED     |
  +---------------+                   +---------------+
          |                                   |
          | (Admin Refund)                    | (Stock Compensated)
          v                                   v
  +---------------+                   +---------------+
  |   REFUNDED    |                   | Order Cancel  |
  +---------------+                   +---------------+
```

### State Definitions

| State | Trigger | Order Effect | Outbox Event |
| :--- | :--- | :--- | :--- |
| **`PENDING`** | `POST /api/v1/payments/initiate` | Remains `PAYMENT_PENDING` | `payment.initiated.v1` |
| **`SUCCESS`** | Inbound verified webhook (`PAYMENT_SUCCESS`) | Transitions `PAYMENT_PENDING` → `CONFIRMED` | `payment.succeeded.v1` |
| **`FAILED`** | Inbound verified webhook (`PAYMENT_FAILED`) | Transitions `PAYMENT_PENDING` → `CANCELLED`, restores reserved stock | `payment.failed.v1` |
| **`REFUNDED`** | `POST /api/v1/payments/:id/refund` | Transitions `CONFIRMED` → `REFUNDED`, restores stock | `payment.refunded.v1` |

---

## 2. Server-Authoritative Financial Integrity

Payment amounts are strictly calculated server-side:

```typescript
// payments.service.ts
const authoritativeAmount = order.grandTotal;
if (authoritativeAmount <= 0) {
  throw new BadRequestException('Order amount must be greater than zero');
}
```

- Any client-submitted amount is ignored or rejected.
- All amounts are represented as 64-bit integers in minor units (paise for `INR`, cents for `USD`). Floating-point currency representation is forbidden to prevent rounding discrepancies.
- Currency defaults to `INR` and is verified by the provider adapter before creating a session.

---

## 3. ACID Compensation & Stock Release

When a payment fails or is refunded, inventory reservation is released:

```typescript
// Atomically restore product stock and log audit record
await tx.order.update({
  where: { id: order.id },
  data: { status: PrismaOrderStatus.CANCELLED },
});

for (const item of order.items || []) {
  const product = await tx.product.findUnique({ where: { id: item.productId } });
  if (product) {
    const updated = await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        changeQuantity: item.quantity,
        previousStock: product.stock,
        newStock: updated.stock,
        reason: 'ORDER_PAYMENT_FAILED_RELEASE',
        referenceId: order.id,
      },
    });
  }
}
```
