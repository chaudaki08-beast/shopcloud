import { prisma } from './index';

async function main() {
  console.log('🌱 Starting deterministic ShopCloud Database Seed...');

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
    console.log(`  📁 Category ready: ${record.name} (${record.slug})`);
  }

  // 2. Seed Permissions & Role Mappings
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
  console.log(`  🔑 Seeded ${Object.keys(seededPermissions).length} fine-grained permissions`);

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

  // 3. Seed Clearly-Labeled Development Users
  // Standard development hash for "Password123!"
  const devPasswordHash = '$2b$10$wK1RkM1P0qO5Uo.9y7k1/uS0f76sD2b.JzI9e/s49c81p0d3iJ4w2';

  const devUsers = [
    {
      id: 'usr-admin-demo',
      email: 'admin@shopcloud.dev',
      passwordHash: devPasswordHash,
      firstName: 'Cloud',
      lastName: 'Admin',
      role: 'SUPER_ADMIN' as const,
      status: 'ACTIVE' as const,
    },
    {
      id: 'usr-customer-demo',
      email: 'customer@shopcloud.dev',
      passwordHash: devPasswordHash,
      firstName: 'Ganesh',
      lastName: 'Patil',
      role: 'CUSTOMER' as const,
      status: 'ACTIVE' as const,
    },
    {
      id: 'usr-inventory-demo',
      email: 'inventory@shopcloud.dev',
      passwordHash: devPasswordHash,
      firstName: 'Stock',
      lastName: 'Manager',
      role: 'INVENTORY_MANAGER' as const,
      status: 'ACTIVE' as const,
    },
    {
      id: 'usr-disabled-demo',
      email: 'disabled@shopcloud.dev',
      passwordHash: devPasswordHash,
      firstName: 'Disabled',
      lastName: 'User',
      role: 'CUSTOMER' as const,
      status: 'DISABLED' as const,
    },
  ];

  for (const user of devUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      create: user,
    });
    console.log(`  👤 Dev User ready: ${user.email} [${user.role} - ${user.status}]`);
  }

  // 3. Seed Realistic Products across Categories
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
          altText: 'MacBook Pro 16 M4 Max Space Black',
        },
      ],
    },
    {
      name: 'Dell XPS 16 OLED Developer Edition',
      slug: 'dell-xps-16-oled',
      sku: 'DEL-XPS16-U9-32G',
      description: 'Intel Core Ultra 9, NVIDIA RTX 4070, 32GB LPDDR5x, 1TB PCIe NVMe SSD, 4K+ OLED Touch.',
      price: 28999900, // ₹2,89,999.00 in paise
      discountPercentage: 12,
      stock: 20,
      categorySlug: 'laptops',
      attributes: { memory: '32GB', storage: '1TB SSD', display: '16.3 4K+ OLED Touch' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Dell XPS 16 OLED Developer Edition',
        },
      ],
    },
    {
      name: 'Sony WH-1000XM5 Wireless Headphones',
      slug: 'sony-wh-1000xm5-silver',
      sku: 'SNY-WH1000XM5-SLV',
      description: 'Industry-leading noise cancellation with Auto NC Optimizer, 30 hours battery life, Silver.',
      price: 2999000, // ₹29,990.00 in paise
      discountPercentage: 15,
      stock: 50,
      categorySlug: 'audio',
      attributes: { color: 'Silver', battery: '30 hours', connection: 'Bluetooth 5.2 / 3.5mm' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Sony WH-1000XM5 Silver Noise Cancelling Headphones',
        },
      ],
    },
    {
      name: 'Sony Bravia XR 65" 4K OLED TV',
      slug: 'sony-bravia-xr-65-oled',
      sku: 'SNY-BRAVIA-65-OLED',
      description: 'Cognitive Processor XR, Pure Black OLED contrast, Dolby Vision HDR, Acoustic Surface Audio+.',
      price: 21990000, // ₹2,19,900.00 in paise
      discountPercentage: 8,
      stock: 12,
      categorySlug: 'televisions',
      attributes: { resolution: '4K Ultra HD', refreshRate: '120Hz', panel: 'OLED' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Sony Bravia XR 65 OLED Display',
        },
      ],
    },
    {
      name: 'Sony PlayStation 5 Pro Console',
      slug: 'playstation-5-pro',
      sku: 'SNY-PS5-PRO-2TB',
      description: 'PlayStation Spectral Super Resolution (PSSR), Advanced Ray Tracing, 2TB SSD, DualSense Controller.',
      price: 6999000, // ₹69,990.00 in paise
      discountPercentage: 0,
      stock: 35,
      categorySlug: 'gaming',
      attributes: { storage: '2TB SSD', output: '8K / 4K 120Hz', controller: 'DualSense Wireless' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'PlayStation 5 Pro Console and Controller',
        },
      ],
    },
    {
      name: 'Dyson V15 Detect Cordless Vacuum',
      slug: 'dyson-v15-detect-vacuum',
      sku: 'DYS-V15-DETECT-YLW',
      description: 'Laser reveals invisible microscopic dust, piezo sensor measures dust particles, up to 60 min run time.',
      price: 6290000, // ₹62,900.00 in paise
      discountPercentage: 10,
      stock: 22,
      categorySlug: 'home-appliances',
      attributes: { runTime: '60 minutes', weight: '3.1 kg', filtration: 'HEPA whole-machine' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Dyson V15 Detect Smart Vacuum',
        },
      ],
    },
  ];

  for (const prod of products) {
    const { categorySlug, images, ...prodData } = prod;
    const categoryId = seededCategories[categorySlug];

    const productRecord = await prisma.product.upsert({
      where: { sku: prodData.sku },
      update: {
        name: prodData.name,
        description: prodData.description,
        price: prodData.price,
        discountPercentage: prodData.discountPercentage,
        stock: prodData.stock,
        categoryId,
        attributes: prodData.attributes,
      },
      create: {
        ...prodData,
        categoryId,
      },
    });

    // Seed primary image
    if (images && images.length > 0) {
      await prisma.productImage.deleteMany({
        where: { productId: productRecord.id },
      });
      await prisma.productImage.createMany({
        data: images.map((img) => ({
          productId: productRecord.id,
          url: img.url,
          isPrimary: img.isPrimary,
          altText: img.altText,
        })),
      });
    }

    // Record initial inventory movement if not already recorded
    const existingMovement = await prisma.inventoryMovement.findFirst({
      where: { productId: productRecord.id, reason: 'INITIAL_STOCK' },
    });
    if (!existingMovement) {
      await prisma.inventoryMovement.create({
        data: {
          productId: productRecord.id,
          changeQuantity: productRecord.stock,
          previousStock: 0,
          newStock: productRecord.stock,
          reason: 'INITIAL_STOCK',
        },
      });
    }

    console.log(`  📦 Product ready: ${productRecord.name} [SKU: ${productRecord.sku}, Stock: ${productRecord.stock}]`);
  }

  // 4. Seed Promotional Coupons
  const coupons = [
    {
      code: 'WELCOME10',
      description: '10% discount on orders over INR 1,000',
      discountPercentage: 10,
      minOrderAmount: 100000, // INR 1,000.00
      maxDiscountAmount: 500000, // INR 5,000.00 max discount
      usageLimit: 1000,
      isActive: true,
    },
    {
      code: 'CLOUD5000',
      description: 'Flat INR 5,000 instant discount on high-end tech purchases over INR 50,000',
      discountAmount: 500000, // INR 5,000.00
      minOrderAmount: 5000000, // INR 50,000.00
      usageLimit: 200,
      isActive: true,
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        description: coupon.description,
        discountPercentage: coupon.discountPercentage,
        discountAmount: coupon.discountAmount,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount,
        isActive: coupon.isActive,
      },
      create: coupon,
    });
    console.log(`  🎟️ Coupon ready: ${coupon.code}`);
  }

  console.log('🎉 ShopCloud Database Seed completed with 100% determinism!');
}

main()
  .catch((e) => {
    console.error('❌ Fatal error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
