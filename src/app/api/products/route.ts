import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProductWithStock } from "@/lib/schemas";

export async function GET() {
  const products = await prisma.product.findMany({
    include: {
      stock: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  const response: ProductWithStock[] = products.map((p) => ({
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

  return NextResponse.json(response);
}
