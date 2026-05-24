import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservation-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await releaseReservation(params.id);

  if (!result.success) {
    if (result.reason === "NOT_FOUND") {
      return Response.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (result.reason === "ALREADY_CONFIRMED") {
      return Response.json(
        { error: "Cannot release a confirmed reservation" },
        { status: 409 }
      );
    }
    if (result.reason === "ALREADY_RELEASED") {
      return Response.json(
        { error: "Reservation is already released" },
        { status: 409 }
      );
    }
  }

  return Response.json((result as { success: true; reservation: unknown }).reservation);
}
