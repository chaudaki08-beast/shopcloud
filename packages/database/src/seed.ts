import { prisma } from './index';

async function main() {
  console.log('🌱 Starting ShopCloud Database Seed...');

  // 1. Seed Categories
  const catSmartphones = await prisma.category.upsert({
    where: { slug: 'smartphones' },
    update: {},
    create: {
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Next-generation flagship smartphones and mobile devices',
    },
  });

  const catLaptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: {
      name: 'Laptops',
      slug: 'laptops',
      description: 'High-performance laptops for creators, professionals and developers',
    },
  });

  const catAudio = await prisma.category.upsert({
    where: { slug: 'audio' },
    update: {},
    create: {
      name: 'Audio & Wearables',
      slug: 'audio',
      description: 'Noise cancelling headphones, earbuds and smart accessories',
    },
  });

  // 2. Seed Users
  // In production password hash is generated via bcrypt (e.g. "Password123!")
  const defaultHash = '$2b$10$wK1RkM1P0qO5Uo.9y7k1/uS0f76sD2b.JzI9e/s49c81p0d3iJ4w2'; // 'Password123!'

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@shopcloud.dev' },
    update: {},
    create: {
      email: 'admin@shopcloud.dev',
      passwordHash: defaultHash,
      firstName: 'Cloud',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });

  const demoCustomer = await prisma.user.upsert({
    where: { email: 'customer@shopcloud.dev' },
    update: {},
    create: {
      email: 'customer@shopcloud.dev',
      passwordHash: defaultHash,
      firstName: 'Ganesh',
      lastName: 'Patil',
      role: 'CUSTOMER',
    },
  });

  // 3. Seed Products
  const products = [
    {
      name: 'Samsung Galaxy S25 Ultra 5G',
      slug: 'samsung-galaxy-s25-ultra',
      sku: 'SAM-S25-512-TI',
      description: 'Titanium Grey, 512GB Storage, 12GB RAM, 200MP Camera, AI-powered smartphone.',
      price: 12999900, // ₹1,29,999.00 in paise
      discountPercentage: 10,
      stock: 45,
      categoryId: catSmartphones.id,
      attributes: { storage: '512GB', color: 'Titanium Grey', screen: '6.8 Dynamic AMOLED' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Samsung Galaxy S25 Front & Back View',
        },
      ],
    },
    {
      name: 'Apple iPhone 16 Pro Max',
      slug: 'apple-iphone-16-pro-max',
      sku: 'APL-IP16PM-256-DES',
      description: 'Grade 5 Titanium design with Desert Titanium finish, A18 Pro chip, 48MP Fusion camera.',
      price: 14490000, // ₹1,44,900.00
      discountPercentage: 5,
      stock: 25,
      categoryId: catSmartphones.id,
      attributes: { storage: '256GB', color: 'Desert Titanium', display: '6.9 Super Retina XDR' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'iPhone 16 Pro Max Desert Titanium',
        },
      ],
    },
    {
      name: 'MacBook Pro 16" (M4 Max)',
      slug: 'macbook-pro-16-m4-max',
      sku: 'APL-MBP16-M4M-36G',
      description: 'Space Black, Apple M4 Max 14-core CPU, 32-core GPU, 36GB Unified Memory, 1TB SSD.',
      price: 34990000, // ₹3,49,900.00
      discountPercentage: 7,
      stock: 15,
      categoryId: catLaptops.id,
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
      price: 28999900, // ₹2,89,999.00
      discountPercentage: 12,
      stock: 20,
      categoryId: catLaptops.id,
      attributes: { memory: '32GB', storage: '1TB SSD', display: '16.3 4K+ OLED' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Dell XPS 16 OLED',
        },
      ],
    },
    {
      name: 'Sony WH-1000XM5 Wireless Headphones',
      slug: 'sony-wh-1000xm5-silver',
      sku: 'SNY-WH1000XM5-SLV',
      description: 'Industry-leading noise cancellation with Auto NC Optimizer, 30 hours battery life, Silver.',
      price: 2999000, // ₹29,990.00
      discountPercentage: 15,
      stock: 50,
      categoryId: catAudio.id,
      attributes: { color: 'Silver', battery: '30 hours', connection: 'Bluetooth 5.2 / 3.5mm' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
          isPrimary: true,
          altText: 'Sony WH-1000XM5 Silver Noise Cancelling Headphones',
        },
      ],
    },
  ];

  for (const prod of products) {
    const { images, ...prodData } = prod;
    const existing = await prisma.product.upsert({
      where: { slug: prodData.slug },
      update: {},
      create: {
        ...prodData,
        images: {
          create: images,
        },
      },
    });
    console.log(`✅ Seeded product: ${existing.name} (${existing.sku})`);
  }

  console.log('🎉 ShopCloud Database Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
