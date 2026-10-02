import React from 'react';
import { OrderResponseDto, OrderStatus } from '@shopcloud/contracts';
import { Package, Clock, CheckCircle2, Truck, AlertCircle, ArrowRight } from 'lucide-react';

interface OrdersViewProps {
  orders: OrderResponseDto[];
  isLoading: boolean;
  onRefresh: () => void;
}

const statusColors: Record<OrderStatus, string> = {
  [OrderStatus.CART]: 'bg-slate-100 text-slate-700',
  [OrderStatus.CHECKOUT]: 'bg-blue-100 text-blue-700',
  [OrderStatus.PAYMENT_PENDING]: 'bg-amber-100 text-amber-800 border-amber-200',
  [OrderStatus.PAYMENT_SUCCESS]: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  [OrderStatus.CONFIRMED]: 'bg-blue-100 text-blue-800 border-blue-200',
  [OrderStatus.PROCESSING]: 'bg-purple-100 text-purple-800 border-purple-200',
  [OrderStatus.SHIPPED]: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  [OrderStatus.OUT_FOR_DELIVERY]: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  [OrderStatus.DELIVERED]: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  [OrderStatus.CANCELLED]: 'bg-red-100 text-red-800 border-red-200',
  [OrderStatus.RETURN_REQUESTED]: 'bg-orange-100 text-orange-800 border-orange-200',
  [OrderStatus.RETURN_APPROVED]: 'bg-amber-100 text-amber-800 border-amber-200',
  [OrderStatus.REFUNDED]: 'bg-slate-100 text-slate-800 border-slate-200',
};

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, isLoading, onRefresh }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Your Orders & Deliveries</h2>
          <p className="text-sm text-slate-500">
            Real-time status updates powered by Pub/Sub event consumers
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs font-semibold px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 shadow-sm transition"
        >
          Refresh Orders
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-500">Loading order history...</div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No orders placed yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Once you check out items from the storefront, your order will appear here with live tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const formattedTotal = (order.grandTotal / 100).toLocaleString('en-IN');
            const createdDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition"
              >
                {/* Order Top Bar */}
                <div className="p-5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Order Number
                      </div>
                      <div className="text-sm font-bold text-slate-900 font-mono">
                        {order.orderNumber}
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Date Placed
                      </div>
                      <div className="text-sm text-slate-700">{createdDate}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        statusColors[order.status] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{order.status.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="text-base font-bold text-slate-900">₹{formattedTotal}</span>
                  </div>
                </div>

                {/* Lifecycle Stepper */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white">
                  <div className="flex items-center justify-between max-w-xl mx-auto text-xs font-semibold text-slate-500">
                    <div className="flex flex-col items-center gap-1 text-blue-600">
                      <CheckCircle2 className="w-5 h-5 text-blue-600" />
                      <span>Order Placed</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex flex-col items-center gap-1 ${order.status !== OrderStatus.PAYMENT_PENDING ? 'text-blue-600' : 'text-slate-400'}`}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Payment</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex flex-col items-center gap-1 ${['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) ? 'text-blue-600' : 'text-slate-400'}`}>
                      <Package className="w-5 h-5" />
                      <span>Confirmed</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex flex-col items-center gap-1 ${['SHIPPED', 'DELIVERED'].includes(order.status) ? 'text-blue-600' : 'text-slate-400'}`}>
                      <Truck className="w-5 h-5" />
                      <span>Delivery</span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="p-6 divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-semibold text-slate-900">{item.productName}</span>
                        <div className="text-xs text-slate-500 font-mono">
                          SKU: {item.sku} &bull; Qty: {item.quantity} &times; ₹
                          {(item.unitPrice / 100).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">
                        ₹{(item.lineTotal / 100).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping & Recipient Footer */}
                <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-wrap justify-between items-center text-xs text-slate-500">
                  <div>
                    Ship to:{' '}
                    <span className="font-medium text-slate-700">
                      {order.shippingAddress?.recipientName} &bull;{' '}
                      {order.shippingAddress?.city}, {order.shippingAddress?.postalCode}
                    </span>
                  </div>
                  <div>
                    Payment ID:{' '}
                    <span className="font-mono text-slate-700">
                      {order.paymentId || 'Pending Webhook'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
