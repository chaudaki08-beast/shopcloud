import { prisma } from './index';

/**
 * ShopCloud Safe Production Database Seed / Initialization
 * 
 * Complies with Phase 8 Security & Determinism specifications:
 * - Deterministic, idempotent catalog data (categories, initial products, images, coupons)
 * - Required RBAC matrix (permissions and role-permission associations)
 * - STRICTLY NO default/dummy dev accounts (e.g. admin@shopcloud.dev with Password123!)
 * - Optional production admin creation ONLY if SEED_ADMIN_EMAIL & SEED_ADMIN_PASSWORD_HASH are supplied.
 */
async function main() {
  console.log('🌱 Starting deterministic ShopCloud Production Initialization...');

  // 1. Seed Categories (Idempotent via unique slug)
  const categories = [
    {
      id: 'cat-smartphones',
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Next-generation flagship smartphones and mobile devices',
    },
    {
      id: 'cat-laptops',
      name: 'Laptops',
      slug: 'laptops',
      description: 'High-performance laptops for creators, professionals and developers',
    },
    {
      id: 'cat-audio',
      name: 'Audio & Wearables',
      slug: 'audio',
      description: 'Noise cancelling headphones, earbuds and smart accessories',
    },
    {
      id: 'cat-televisions',
      name: 'Televisions & Displays',
      slug: 'televisions',
      description: 'Ultra HD 4K OLED televisions and cinematic home theatre displays',
    },
    {
      id: 'cat-gaming',
      name: 'Gaming & Consoles',
      slug: 'gaming',
      description: 'Next-gen gaming consoles, wireless controllers and accessories',
    },
    {
      id: 'cat-home-appliances',
      name: 'Smart Home Appliances',
      slug: 'home-appliances',
      description: 'Intelligent vacuum cleaners, air purifiers and IoT smart living devices',
    },
  ];

  const seededCategories: Record<string, string> = {};

  for (const cat of categories) {
    const record = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
      },
      create: cat,
    });
    seededCategories[cat.slug] = record.id;
    console.log(`  📁 Category verified: ${record.name} (${record.slug})`);
  }

  // 2. Seed Fine-Grained Permissions
  const permissionsList = [
    { name: 'products:read', description: 'View products and catalog items' },
    { name: 'products:create', description: 'Create new catalog products' },
    { name: 'products:update', description: 'Update products and specifications' },
    { name: 'products:delete', description: 'Delete catalog products' },
    { name: 'categories:read', description: 'View categories' },
    { name: 'categories:create', description: 'Create new categories' },
    { name: 'categories:update', description: 'Update existing categories' },
    { name: 'categories:delete', description: 'Delete categories' },
    { name: 'cart:read', description: 'View shopping cart items' },
    { name: 'cart:update', description: 'Add, update or clear cart items' },
    { name: 'orders:read', description: 'View placed orders' },
    { name: 'orders:create', description: 'Place new orders' },
    { name: 'orders:update', description: 'Update order status and logistics' },
    { name: 'orders:cancel', description: 'Cancel active orders' },
    { name: 'inventory:read', description: 'View stock levels and movements' },
    { name: 'inventory:update', description: 'Adjust inventory stock' },
    { name: 'users:read', description: 'View user profiles' },
    { name: 'users:update', description: 'Update user profiles' },
    { name: 'admin:manage', description: 'Full administrative access' },
  ];

  const seededPermissions: Record<string, string> = {};
  for (const perm of permissionsList) {
    const record = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
    seededPermissions[perm.name] = record.id;
  }
  console.log(`  🔑 Verified ${Object.keys(seededPermissions).length} fine-grained permissions`);

  // Map permissions to roles
  const rolePermissionsMap: Record<string, string[]> = {
    SUPER_ADMIN: permissionsList.map((p) => p.name),
    STORE_ADMIN: [
      'products:read', 'products:create', 'products:update', 'products:delete',
      'categories:read', 'categories:create', 'categories:update', 'categories:delete',
      'orders:read', 'orders:update', 'orders:cancel',
      'inventory:read', 'inventory:update',
      'users:read', 'admin:manage',
    ],
    INVENTORY_MANAGER: [
      'products:read', 'categories:read',
      'inventory:read', 'inventory:update',
      'orders:read',
    ],
    CUSTOMER: [
      'products:read', 'categories:read',
      'cart:read', 'cart:update',
      'orders:read', 'orders:create', 'orders:cancel',
    ],
    CUSTOMER_SUPPORT: [
      'products:read', 'categories:read',
      'orders:read', 'orders:cancel',
      'users:read',
    ],
  };

  for (const [role, perms] of Object.entries(rolePermissionsMap)) {
    for (const permName of perms) {
      const permId = seededPermissions[permName];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            role_permissionId: {
              role: role as any,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            role: role as any,
            permissionId: permId,
          },
        });
      }
    }
  }
  console.log('  🛡️ Role-Permission matrices linked successfully');

  // 3. Optional Production Admin Setup (NO hardcoded credentials)
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPasswordHash = process.env.SEED_ADMIN_PASSWORD_HASH;
  if (adminEmail && adminPasswordHash) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        passwordHash: adminPasswordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        firstName: process.env.SEED_ADMIN_FIRSTNAME || 'System',
        lastName: process.env.SEED_ADMIN_LASTNAME || 'Administrator',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`  👤 Production Admin account provisioned: ${adminEmail}`);
  } else {
    console.log('  ℹ️  No SEED_ADMIN_EMAIL configured; skipping admin account creation (safe production mode)');
  }

  // 4. Seed Standard Catalog Products
  const products = [
    {
      name: 'Samsung Galaxy S25 Ultra 5G',
      slug: 'samsung-galaxy-s25-ultra',
      sku: 'SAM-S25-512-TI',
      description: 'Titanium Grey, 512GB Storage, 12GB RAM, 200MP Camera, AI-powered flagship smartphone.',
      price: 12999900, // ₹1,29,999.00 in paise
      discountPercentage: 10,
      stock: 45,
      categorySlug: 'smartphones',
      attributes: { storage: '512GB', color: 'Titanium Grey', screen: '6.8 Dynamic AMOLED 2X' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Samsung Galaxy S25 Ultra Titanium Grey',
        },
      ],
    },
    {
      name: 'Apple iPhone 16 Pro Max',
      slug: 'apple-iphone-16-pro-max',
      sku: 'APL-IP16PM-256-DES',
      description: 'Grade 5 Titanium design with Desert Titanium finish, A18 Pro chip, 48MP Fusion camera system.',
      price: 14490000, // ₹1,44,900.00 in paise
      discountPercentage: 5,
      stock: 25,
      categorySlug: 'smartphones',
      attributes: { storage: '256GB', color: 'Desert Titanium', display: '6.9 Super Retina XDR' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Apple iPhone 16 Pro Max Desert Titanium',
        },
      ],
    },
    {
      name: 'MacBook Pro 16" (M4 Max)',
      slug: 'macbook-pro-16-m4-max',
      sku: 'APL-MBP16-M4M-36G',
      description: 'Space Black, Apple M4 Max 14-core CPU, 32-core GPU, 36GB Unified Memory, 1TB SSD.',
      price: 34990000, // ₹3,49,900.00 in paise
      discountPercentage: 7,
      stock: 15,
      categorySlug: 'laptops',
      attributes: { memory: '36GB', storage: '1TB SSD', processor: 'Apple M4 Max' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Apple MacBook Pro 16 Space Black',
        },
      ],
    },
    {
      name: 'Sony WH-1000XM5 Wireless Headphones',
      slug: 'sony-wh-1000xm5',
      sku: 'SNY-WH1000XM5-BLK',
      description: 'Industry-leading noise cancellation, 30-hour battery life, ultra-comfortable lightweight design.',
      price: 2999000, // ₹29,990.00 in paise
      discountPercentage: 15,
      stock: 50,
      categorySlug: 'audio',
      attributes: { battery: '30h', noiseCancelling: 'Active', connectivity: 'Bluetooth 5.2' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Sony WH-1000XM5 Wireless Headphones',
        },
      ],
    },
    {
      name: 'Sony PlayStation 5 Pro',
      slug: 'sony-playstation-5-pro',
      sku: 'SNY-PS5-PRO-2TB',
      description: 'PlayStation Spectral Super Resolution (PSSR), advanced ray tracing, 2TB high-speed NVMe SSD.',
      price: 6999000, // ₹69,990.00 in paise
      discountPercentage: 0,
      stock: 20,
      categorySlug: 'gaming',
      attributes: { storage: '2TB SSD', output: '4K 120Hz / 8K', edition: 'Digital Edition' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Sony PlayStation 5 Pro Console',
        },
      ],
    },
    {
      name: 'LG C4 55" 4K OLED evo TV',
      slug: 'lg-c4-55-oled-tv',
      sku: 'LG-OLED55C4-4K',
      description: 'Self-lit OLED pixels with infinite contrast, α9 AI Processor Gen7, 144Hz refresh rate, Dolby Vision.',
      price: 13499000, // ₹1,34,990.00 in paise
      discountPercentage: 12,
      stock: 10,
      categorySlug: 'televisions',
      attributes: { displaySize: '55 inch', resolution: '4K UHD', refreshRate: '144Hz' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'LG C4 55 OLED TV',
        },
      ],
    },
  ];

  for (const prod of products) {
    const categoryId = seededCategories[prod.categorySlug];
    if (!categoryId) continue;

    const record = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        sku: prod.sku,
        description: prod.description,
        price: prod.price,
        discountPercentage: prod.discountPercentage,
        stock: prod.stock,
        categoryId: categoryId,
        attributes: prod.attributes,
      },
      create: {
        name: prod.name,
        slug: prod.slug,
        sku: prod.sku,
        description: prod.description,
        price: prod.price,
        discountPercentage: prod.discountPercentage,
        stock: prod.stock,
        categoryId: categoryId,
        attributes: prod.attributes,
      },
    });

    for (const img of prod.images) {
      await prisma.productImage.upsert({
        where: { id: `img-${record.id}` },
        update: {
          url: img.url,
          altText: img.altText,
          isPrimary: img.isPrimary,
        },
        create: {
          id: `img-${record.id}`,
          productId: record.id,
          url: img.url,
          altText: img.altText,
          isPrimary: img.isPrimary,
        },
      });
    }

    console.log(`  📦 Product verified: ${record.name} [Stock: ${record.stock}]`);
  }

  // 5. Seed Welcome Coupon
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {
      discountPercentage: 10,
      maxDiscountAmount: 100000, // ₹1,000 max
      minOrderAmount: 200000, // ₹2,000 min
      isActive: true,
    },
    create: {
      code: 'WELCOME10',
      discountPercentage: 10,
      maxDiscountAmount: 100000,
      minOrderAmount: 200000,
      isActive: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });
  console.log('  🏷️ Coupon verified: WELCOME10 (10% discount)');

  console.log('✅ Deterministic ShopCloud Production Database Initialization complete.');
}

main()
  .catch((e) => {
    console.error('❌ Error during production database initialization:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
