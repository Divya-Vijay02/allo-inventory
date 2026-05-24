import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservation-service";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const idempotencyKey = request.headers.get("Idempotency-Key");

  return withIdempotency(idempotencyKey, async () => {
    const result = await confirmReservation(params.id);

    if (!result.success) {
      if (result.reason === "NOT_FOUND") {
        return { status: 404, body: { error: "Reservation not found" } };
      }
      if (result.reason === "EXPIRED") {
        return {
          status: 410,
          body: { error: "Reservation has expired", code: "RESERVATION_EXPIRED" },
        };
      }
      if (result.reason === "ALREADY_CONFIRMED") {
        return { status: 409, body: { error: "Reservation already confirmed" } };
      }
      if (result.reason === "ALREADY_RELEASED") {
        return { status: 409, body: { error: "Reservation has already been released" } };
      }
    }

    return { status: 200, body: (result as { success: true; reservation: unknown }).reservation };
  });
}
