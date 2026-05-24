import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";

async function getReservation(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  });
  return reservation;
}

export default async function CheckoutPage({
  params,
}: {
  params: { id: string };
}) {
  const reservation = await getReservation(params.id);
  if (!reservation) notFound();

  return (
    <CheckoutClient
      reservation={{
        id: reservation.id,
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        quantity: reservation.quantity,
        status: reservation.status as "PENDING" | "CONFIRMED" | "RELEASED",
        expiresAt: reservation.expiresAt.toISOString(),
        confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
        releasedAt: reservation.releasedAt?.toISOString() ?? null,
        createdAt: reservation.createdAt.toISOString(),
        product: {
          id: reservation.product.id,
          name: reservation.product.name,
          sku: reservation.product.sku,
          price: reservation.product.price.toString(),
          imageUrl: reservation.product.imageUrl,
        },
        warehouse: {
          id: reservation.warehouse.id,
          name: reservation.warehouse.name,
          location: reservation.warehouse.location,
        },
      }}
    />
  );
}
