import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean slate
  await prisma.reservation.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Warehouses
  const [delhi, mumbai, bengaluru] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Delhi Fulfillment Center", location: "New Delhi, IN" },
    }),
    prisma.warehouse.create({
      data: { name: "Mumbai Hub", location: "Mumbai, IN" },
    }),
    prisma.warehouse.create({
      data: { name: "Bengaluru Tech Warehouse", location: "Bengaluru, IN" },
    }),
  ]);

  // Products
  const [airpods, watch, keyboard, monitor, headphones] = await Promise.all([
    prisma.product.create({
      data: {
        name: "AirPods Pro (3rd Gen)",
        description: "Active noise cancellation, Adaptive Audio, USB-C charging case",
        sku: "APP-3G-001",
        price: 24900,
        imageUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple Watch Ultra 2",
        description: "49mm Titanium Case, Trail Loop, 60hr battery",
        sku: "AWU-2-001",
        price: 89900,
        imageUrl: "https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Keychron Q1 Pro",
        description: "75% Wireless Mechanical Keyboard, QMK/VIA",
        sku: "KCQ-1P-001",
        price: 15999,
        imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: 'LG UltraFine 27" 4K',
        description: "IPS, USB-C 96W, Thunderbolt 3, HDR400",
        sku: "LGU-27-4K",
        price: 54999,
        imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5",
        description: "Industry-leading noise cancelling, 30hr battery, multipoint",
        sku: "SWH-XM5-001",
        price: 26990,
        imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400",
      },
    }),
  ]);

  // Stock — intentionally low on some to demo race conditions
  await prisma.stock.createMany({
    data: [
      // AirPods
      { productId: airpods.id, warehouseId: delhi.id, total: 10, reserved: 0 },
      { productId: airpods.id, warehouseId: mumbai.id, total: 3, reserved: 0 },
      { productId: airpods.id, warehouseId: bengaluru.id, total: 1, reserved: 0 }, // 🔥 race condition demo

      // Watch
      { productId: watch.id, warehouseId: delhi.id, total: 5, reserved: 0 },
      { productId: watch.id, warehouseId: mumbai.id, total: 2, reserved: 0 },

      // Keyboard
      { productId: keyboard.id, warehouseId: bengaluru.id, total: 8, reserved: 0 },
      { productId: keyboard.id, warehouseId: delhi.id, total: 1, reserved: 0 }, // 🔥 race condition demo

      // Monitor
      { productId: monitor.id, warehouseId: mumbai.id, total: 4, reserved: 0 },
      { productId: monitor.id, warehouseId: bengaluru.id, total: 1, reserved: 0 },

      // Headphones
      { productId: headphones.id, warehouseId: delhi.id, total: 12, reserved: 0 },
      { productId: headphones.id, warehouseId: mumbai.id, total: 0, reserved: 0 }, // out of stock demo
    ],
  });

  console.log("✅ Seeded:");
  console.log("   3 warehouses");
  console.log("   5 products");
  console.log("   11 stock entries (incl. low-stock and out-of-stock scenarios)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
