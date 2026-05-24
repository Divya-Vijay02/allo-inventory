/**
 * reservation-service.ts
 *
 * This module contains the core business logic for inventory reservations.
 *
 * CONCURRENCY STRATEGY
 * ====================
 * The key invariant: (stock.reserved + reservation.quantity) must never exceed
 * stock.total for any given (productId, warehouseId) pair.
 *
 * We guarantee this with a single atomic SQL UPDATE that checks the constraint
 * in the WHERE clause:
 *
 *   UPDATE "Stock"
 *   SET reserved = reserved + $quantity
 *   WHERE "productId" = $productId
 *     AND "warehouseId" = $warehouseId
 *     AND (total - reserved) >= $quantity   ← atomically checks + acquires
 *   RETURNING *
 *
 * If two concurrent requests race to reserve the last unit:
 *   - Request A: UPDATE fires, finds (total - reserved) = 1 >= 1, succeeds, reserved → 1
 *   - Request B: UPDATE fires, finds (total - reserved) = 0 >= 1 is FALSE, returns 0 rows
 *   - Request B: sees 0 rows updated → returns 409 Conflict
 *
 * This is safe because PostgreSQL UPDATE is atomic at the row level. No two
 * transactions can observe the same pre-update state for the same row.
 *
 * We do NOT use application-level locking (Redis Redlock), advisory locks, or
 * SELECT FOR UPDATE here — the atomic conditional UPDATE is simpler, more
 * performant, and equally correct.
 *
 * EXPIRY
 * ======
 * Expiry is handled by a Vercel Cron job hitting /api/cron/release-expired.
 * See README for details.
 */

import { prisma } from "./prisma";
import type { ReservationResponse } from "./schemas";

const RESERVATION_TTL_MINUTES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatReservation(r: {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  expiresAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  product: { id: string; name: string; sku: string; price: { toString(): string }; imageUrl: string | null };
  warehouse: { id: string; name: string; location: string };
}): ReservationResponse {
  return {
    id: r.id,
    productId: r.productId,
    warehouseId: r.warehouseId,
    quantity: r.quantity,
    status: r.status as ReservationResponse["status"],
    expiresAt: r.expiresAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    product: {
      id: r.product.id,
      name: r.product.name,
      sku: r.product.sku,
      price: r.product.price.toString(),
      imageUrl: r.product.imageUrl,
    },
    warehouse: {
      id: r.warehouse.id,
      name: r.warehouse.name,
      location: r.warehouse.location,
    },
  };
}

// ─── Create Reservation ───────────────────────────────────────────────────────

export type CreateResult =
  | { success: true; reservation: ReservationResponse }
  | { success: false; reason: "INSUFFICIENT_STOCK" | "PRODUCT_NOT_FOUND" | "STOCK_NOT_FOUND" };

export async function createReservation(
  productId: string,
  warehouseId: string,
  quantity: number
): Promise<CreateResult> {
  // Verify product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { success: false, reason: "PRODUCT_NOT_FOUND" };

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

  // ─── ATOMIC RESERVATION ────────────────────────────────────────────────────
  //
  // We use a raw SQL UPDATE with the availability check baked into the WHERE
  // clause. This is the single most important piece of correctness in the app.
  //
  // PostgreSQL guarantees row-level atomicity for UPDATE statements, so two
  // concurrent transactions cannot both pass the (total - reserved >= quantity)
  // check for the same row.
  //
  const result = await prisma.$executeRaw`
    UPDATE "Stock"
    SET reserved = reserved + ${quantity}
    WHERE "productId" = ${productId}
      AND "warehouseId" = ${warehouseId}
      AND (total - reserved) >= ${quantity}
  `;

  if (result === 0) {
    // Either stock row doesn't exist or there isn't enough available inventory
    const stock = await prisma.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    if (!stock) return { success: false, reason: "STOCK_NOT_FOUND" };
    return { success: false, reason: "INSUFFICIENT_STOCK" };
  }

  // Stock was atomically decremented — now create the reservation record
  const reservation = await prisma.reservation.create({
    data: {
      productId,
      warehouseId,
      quantity,
      status: "PENDING",
      expiresAt,
    },
    include: { product: true, warehouse: true },
  });

  return { success: true, reservation: formatReservation(reservation) };
}

// ─── Confirm Reservation ──────────────────────────────────────────────────────

export type ConfirmResult =
  | { success: true; reservation: ReservationResponse }
  | { success: false; reason: "NOT_FOUND" | "EXPIRED" | "ALREADY_CONFIRMED" | "ALREADY_RELEASED" };

export async function confirmReservation(id: string): Promise<ConfirmResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) return { success: false, reason: "NOT_FOUND" };
  if (reservation.status === "CONFIRMED") return { success: false, reason: "ALREADY_CONFIRMED" };
  if (reservation.status === "RELEASED") return { success: false, reason: "ALREADY_RELEASED" };

  // Check expiry
  if (new Date() > reservation.expiresAt) {
    // Lazy cleanup — release the stock and mark as released
    await releaseStockAndMarkReservation(reservation.id, reservation.productId, reservation.warehouseId, reservation.quantity);
    return { success: false, reason: "EXPIRED" };
  }

  // Confirm: status changes, reserved count stays the same (units are now
  // permanently decremented from available pool, but we track via total - reserved
  // so we need to also decrement total and reduce reserved)
  const [updated] = await prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: { product: true, warehouse: true },
    }),
    // On confirm: decrement total (permanent sale) and release the reserved hold
    prisma.$executeRaw`
      UPDATE "Stock"
      SET total = total - ${reservation.quantity},
          reserved = reserved - ${reservation.quantity}
      WHERE "productId" = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
    `,
  ]);

  return { success: true, reservation: formatReservation(updated) };
}

// ─── Release Reservation ──────────────────────────────────────────────────────

export type ReleaseResult =
  | { success: true; reservation: ReservationResponse }
  | { success: false; reason: "NOT_FOUND" | "ALREADY_CONFIRMED" | "ALREADY_RELEASED" };

export async function releaseReservation(id: string): Promise<ReleaseResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) return { success: false, reason: "NOT_FOUND" };
  if (reservation.status === "CONFIRMED") return { success: false, reason: "ALREADY_CONFIRMED" };
  if (reservation.status === "RELEASED") return { success: false, reason: "ALREADY_RELEASED" };

  const updated = await releaseStockAndMarkReservation(
    reservation.id,
    reservation.productId,
    reservation.warehouseId,
    reservation.quantity
  );

  return { success: true, reservation: formatReservation({ ...updated, product: reservation.product, warehouse: reservation.warehouse }) };
}

// ─── Shared Release Helper ────────────────────────────────────────────────────

async function releaseStockAndMarkReservation(
  reservationId: string,
  productId: string,
  warehouseId: string,
  quantity: number
) {
  const [updated] = await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "RELEASED", releasedAt: new Date() },
    }),
    prisma.$executeRaw`
      UPDATE "Stock"
      SET reserved = reserved - ${quantity}
      WHERE "productId" = ${productId}
        AND "warehouseId" = ${warehouseId}
    `,
  ]);
  return updated;
}

// ─── Expire Stale Reservations (called by Cron) ───────────────────────────────

export async function releaseExpiredReservations(): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
  });

  if (expired.length === 0) return 0;

  await prisma.$transaction([
    prisma.reservation.updateMany({
      where: { id: { in: expired.map((r) => r.id) }, status: "PENDING" },
      data: { status: "RELEASED", releasedAt: new Date() },
    }),
    // Bulk release reserved counts
    ...expired.map((r) =>
      prisma.$executeRaw`
        UPDATE "Stock"
        SET reserved = reserved - ${r.quantity}
        WHERE "productId" = ${r.productId}
          AND "warehouseId" = ${r.warehouseId}
          AND reserved >= ${r.quantity}
      `
    ),
  ]);

  return expired.length;
}
