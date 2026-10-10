import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TestPaymentAdapter } from './providers/test-payment.adapter';
import { RazorpayPaymentAdapter } from './providers/razorpay.adapter';
import { StripePaymentAdapter } from './providers/stripe.adapter';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    TestPaymentAdapter,
    RazorpayPaymentAdapter,
    StripePaymentAdapter,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
