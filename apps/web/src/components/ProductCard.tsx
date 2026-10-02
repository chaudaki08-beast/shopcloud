import React from 'react';
import { ProductDto } from '@shopcloud/contracts';
import { ShoppingBag, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ProductCardProps {
  product: ProductDto;
  onAddToCart: (product: ProductDto) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart }) => {
  const originalPrice = product.price / 100;
  const discountAmount = (originalPrice * (product.discountPercentage || 0)) / 100;
  const finalPrice = originalPrice - discountAmount;

  const primaryImage =
    product.images.find((img) => img.isPrimary)?.url ||
    product.images[0]?.url ||
    'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80';

  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;

  return (
    <div className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
      {/* Product Image */}
      <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
        <img
          src={primaryImage}
          alt={product.name}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Discount Badge */}
        {product.discountPercentage > 0 && (
          <span className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md">
            {product.discountPercentage}% OFF
          </span>
        )}

        {/* Stock Status Badge */}
        <div className="absolute top-3 right-3">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1 bg-red-100/90 backdrop-blur-sm text-red-700 text-xs px-2 py-0.5 rounded-full font-medium border border-red-200">
              <XCircle className="w-3 h-3" /> Out of stock
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1 bg-amber-100/90 backdrop-blur-sm text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium border border-amber-200">
              <AlertTriangle className="w-3 h-3" /> Only {product.stock} left
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-emerald-100/90 backdrop-blur-sm text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium border border-emerald-200">
              <CheckCircle className="w-3 h-3" /> In Stock ({product.stock})
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{product.category?.name || 'General'}</span>
            <span className="font-mono text-[10px] text-slate-400">{product.sku}</span>
          </div>

          <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
            {product.name}
          </h3>

          <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Action */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-lg font-bold text-slate-900">
              ₹{finalPrice.toLocaleString('en-IN')}
            </div>
            {product.discountPercentage > 0 && (
              <div className="text-xs text-slate-400 line-through">
                ₹{originalPrice.toLocaleString('en-IN')}
              </div>
            )}
          </div>

          <button
            onClick={() => onAddToCart(product)}
            disabled={isOutOfStock}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${
              isOutOfStock
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-95'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Add to Cart</span>
          </button>
        </div>
      </div>
    </div>
  );
};
