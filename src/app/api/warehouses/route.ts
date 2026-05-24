import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WarehouseResponse } from "@/lib/schemas";

export async function GET() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
  });

  const response: WarehouseResponse[] = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    location: w.location,
  }));

  return NextResponse.json(response);
}
