import React, { useState } from 'react';
import { CreateOrderDto, CartSummaryDto } from '@shopcloud/contracts';
import { X, CreditCard, ShieldCheck, MapPin, Sparkles } from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartSummaryDto | null;
  onSubmitOrder: (dto: CreateOrderDto) => Promise<void>;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  onSubmitOrder,
}) => {
  const [recipientName, setRecipientName] = useState('Ganesh Patil');
  const [phoneNumber, setPhoneNumber] = useState('+91 98765 43210');
  const [street, setStreet] = useState('42 Tech Boulevard, Silicon Heights');
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [postalCode, setPostalCode] = useState('560001');
  const [paymentMethod, setPaymentMethod] = useState<'SANDBOX_STRIPE' | 'SANDBOX_RAZORPAY'>('SANDBOX_STRIPE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const total = (cart?.grandTotal || 0) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const dto: CreateOrderDto = {
      shippingAddress: {
        recipientName,
        phoneNumber,
        street,
        city,
        state,
        postalCode,
        country: 'India',
      },
      paymentMethod,
    };

    try {
      await onSubmitOrder(dto);
      onClose();
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Secure Checkout</h3>
            <p className="text-xs text-slate-500">
              Event-Driven Order Pipeline with GCP Pub/Sub
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Shipping Address */}
          <div>
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-900">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Shipping Address</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-900">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Sandbox Payment Gateway</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition ${
                  paymentMethod === 'SANDBOX_STRIPE'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="SANDBOX_STRIPE"
                  checked={paymentMethod === 'SANDBOX_STRIPE'}
                  onChange={() => setPaymentMethod('SANDBOX_STRIPE')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold">Stripe Sandbox</div>
                  <div className="text-[11px] text-slate-500">Test Cards & Webhooks</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition ${
                  paymentMethod === 'SANDBOX_RAZORPAY'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="SANDBOX_RAZORPAY"
                  checked={paymentMethod === 'SANDBOX_RAZORPAY'}
                  onChange={() => setPaymentMethod('SANDBOX_RAZORPAY')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold">Razorpay Sandbox</div>
                  <div className="text-[11px] text-slate-500">UPI & NetBanking Test</div>
                </div>
              </label>
            </div>
          </div>

          {/* Architecture Callout */}
          <div className="p-3.5 bg-indigo-50/80 border border-indigo-100 rounded-xl flex items-start gap-3 text-xs text-indigo-900">
            <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Event-Driven Architecture in Action:</span>
              <p className="mt-0.5 text-indigo-700 leading-relaxed">
                Placing an order reserves stock using database transaction locking, sets status to
                <span className="font-mono font-bold"> PAYMENT_PENDING</span>, and fires a
                <span className="font-mono font-bold"> shopcloud.order.created</span> event to GCP Pub/Sub.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Total payable</div>
              <div className="text-xl font-bold text-slate-900">
                ₹{total.toLocaleString('en-IN')}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition active:scale-[0.99] disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Reserving & Publishing...' : 'Place Order & Pay'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
