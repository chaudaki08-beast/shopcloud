import React from 'react';
import { ShoppingCart, Package, Shield, User, Cloud } from 'lucide-react';

interface NavbarProps {
  cartItemCount: number;
  onOpenCart: () => void;
  activeTab: 'store' | 'orders' | 'admin';
  setActiveTab: (tab: 'store' | 'orders' | 'admin') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  user: any;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  cartItemCount,
  onOpenCart,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  user,
  onOpenAuth,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <div
            onClick={() => setActiveTab('store')}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-xl text-white shadow-md shadow-blue-500/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
                ShopCloud
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-700 bg-blue-50 rounded-full border border-blue-200 uppercase">
                GCP Native
              </span>
            </div>
          </div>

          {/* Search bar */}
          {activeTab === 'store' && (
            <div className="flex-1 max-w-md hidden md:block">
              <input
                type="text"
                placeholder="Search smartphones, laptops, audio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>
          )}

          {/* Nav Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setActiveTab('store')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'store'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Storefront
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Orders</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Admin Portal</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-2.5 text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              title="Shopping Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-5 h-5 px-1 text-[11px] font-bold text-white bg-blue-600 rounded-full border-2 border-white">
                  {cartItemCount}
                </span>
              )}
            </button>

            {/* User Profile / Auth */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 hidden lg:inline">
                  {user.firstName} ({user.role})
                </span>
                <button
                  onClick={onLogout}
                  className="text-xs px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium border border-red-200"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm"
              >
                <User className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
