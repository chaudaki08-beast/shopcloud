import React, { useState, useEffect } from 'react';
import { api } from './api';
import { ProductDto, CategoryDto, CartSummaryDto, OrderResponseDto } from '@shopcloud/contracts';
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrdersView } from './components/OrdersView';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { Sparkles, Layers, SlidersHorizontal } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'store' | 'orders' | 'admin'>('store');
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Cart & Orders
  const [cart, setCart] = useState<CartSummaryDto | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [orders, setOrders] = useState<OrderResponseDto[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);

  // Auth
  const [user, setUser] = useState<any>(null);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // Load initial data
  useEffect(() => {
    loadCatalog();
    checkAuth();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [selectedCategory, searchQuery, sortBy]);

  const checkAuth = async () => {
    try {
      const profile = await api.getProfile();
      setUser(profile);
      loadCart();
    } catch {
      // Guest mode
    }
  };

  const loadCatalog = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories', err);
    }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await api.getProducts({
        categorySlug: selectedCategory || undefined,
        search: searchQuery || undefined,
        sortBy: sortBy || undefined,
      });
      setProducts(res.data);
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCart = async () => {
    try {
      const currentCart = await api.getCart();
      setCart(currentCart);
    } catch (err) {
      console.error('Failed to load cart', err);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const userOrders = await api.getOrders();
      setOrders(userOrders);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleAddToCart = async (product: ProductDto) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    try {
      const updatedCart = await api.addToCart(product.id, 1);
      setCart(updatedCart);
      setIsCartOpen(true);
    } catch (err) {
      alert((err as Error).message || 'Failed to add item to cart');
    }
  };

  const handleUpdateCartQuantity = async (productId: string, quantity: number) => {
    try {
      const updatedCart = await api.updateCartQuantity(productId, quantity);
      setCart(updatedCart);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFromCart = async (productId: string) => {
    try {
      const updatedCart = await api.removeFromCart(productId);
      setCart(updatedCart);
    } catch (err) {
      console.error(err);
    }
  };

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleSubmitOrder = async (dto: any) => {
    const order = await api.createOrder(dto);
    await loadCart();
    await loadOrders();
    setActiveTab('orders');
    alert(`Order #${order.orderNumber} successfully placed! CloudEvent published to GCP Pub/Sub.`);
  };

  const handleLogout = () => {
    localStorage.removeItem('shopcloud_token');
    setUser(null);
    setCart(null);
    setOrders([]);
    setActiveTab('store');
  };

  const cartItemCount = cart?.items.reduce((acc, i) => acc + i.quantity, 0) || 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        cartItemCount={cartItemCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'orders') loadOrders();
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {activeTab === 'store' && (
          <div>
            {/* Hero Banner */}
            <section className="bg-gradient-to-b from-blue-900 via-indigo-900 to-slate-900 text-white py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
              <div className="max-w-7xl mx-auto text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-400/30 rounded-full text-blue-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Production GCP Architecture &bull; Cloud Run &bull; Cloud SQL &bull; Pub/Sub</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                  Next-Gen Cloud E-Commerce Platform
                </h1>
                <p className="max-w-2xl mx-auto text-slate-300 text-sm sm:text-base leading-relaxed">
                  Real-time transactional inventory reservation, server-side calculated financial totals,
                  and decoupled asynchronous order processing with Google Cloud Pub/Sub.
                </p>
              </div>
            </section>

            {/* Filter and Catalogue Bar */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
                {/* Categories */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      selectedCategory === ''
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    All Products
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.slug)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                        selectedCategory === cat.slug
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Featured / Newest</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="name_asc">Name: A to Z</option>
                  </select>
                </div>
              </div>

              {/* Products Grid */}
              <div className="py-8">
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="bg-white rounded-2xl border border-slate-200 h-80 animate-pulse p-4"
                      />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                    <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-900">No products found</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Try selecting another category or clearing your search.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <OrdersView orders={orders} isLoading={ordersLoading} onRefresh={loadOrders} />
        )}

        {activeTab === 'admin' && <AdminDashboard />}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onProceedToCheckout={handleProceedToCheckout}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        onSubmitOrder={handleSubmitOrder}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          loadCart();
        }}
      />
    </div>
  );
};
