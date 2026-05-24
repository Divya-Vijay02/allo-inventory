/**
 * GET /api/cron/release-expired
 *
 * Called by Vercel Cron on a schedule (every 2 minutes in production).
 * See vercel.json for the cron configuration.
 *
 * Protected by CRON_SECRET environment variable to prevent external abuse.
 */

import { NextRequest } from "next/server";
import { releaseExpiredReservations } from "@/lib/reservation-service";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, Vercel sets the Authorization header automatically.
  // We validate it here to prevent external callers from triggering cleanup.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseExpiredReservations();

  return Response.json({
    ok: true,
    releasedCount: released,
    timestamp: new Date().toISOString(),
  });
}
