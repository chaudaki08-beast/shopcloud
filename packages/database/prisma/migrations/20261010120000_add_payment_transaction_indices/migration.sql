-- CreateIndex
CREATE INDEX "Payment_transactionRef_idx" ON "Payment"("transactionRef");

-- CreateIndex
CREATE INDEX "PaymentEvent_providerRef_idx" ON "PaymentEvent"("providerRef");
