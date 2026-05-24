import { NextRequest } from "next/server";
import { CreateReservationSchema } from "@/lib/schemas";
import { createReservation } from "@/lib/reservation-service";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get("Idempotency-Key");

  return withIdempotency(idempotencyKey, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { status: 400, body: { error: "Invalid JSON" } as object };
    }

    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, body: { error: "Validation failed" } as object };
    }

    const { productId, warehouseId, quantity } = parsed.data;
    const result = await createReservation(productId, warehouseId, quantity);

    if (!result.success) {
      if (result.reason === "INSUFFICIENT_STOCK") {
        return { status: 409, body: { error: "Not enough stock available", code: "INSUFFICIENT_STOCK" } as object };
      }
      return { status: 404, body: { error: "Product or warehouse not found" } as object };
    }

    return { status: 201, body: result.reservation as object };
  });
}