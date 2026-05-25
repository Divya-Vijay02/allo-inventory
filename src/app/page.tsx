export const revalidate = 0;
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/product-card";
import type { ProductWithStock } from "@/lib/schemas";

async function getProducts(): Promise<ProductWithStock[]> {
  const products = await prisma.product.findMany({
    include: {
      stock: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    sku: p.sku,
    price: p.price.toString(),
    imageUrl: p.imageUrl,
    stock: p.stock.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      location: s.warehouse.location,
      total: s.total,
      reserved: s.reserved,
      available: s.total - s.reserved,
    })),
  }));
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-1 w-6 bg-primary rounded-full" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Live Inventory
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reserve items for 10 minutes while you complete checkout.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product, i) => (
          <div
            key={product.id}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No products found</p>
          <p className="text-sm mt-1">Run the seed script to populate inventory</p>
          <code className="mt-2 block text-xs bg-muted px-3 py-1.5 rounded inline-block">
            npm run db:seed
          </code>
        </div>
      )}
    </div>
  );
}
