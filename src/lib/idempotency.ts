/**
 * idempotency.ts
 *
 * Implements idempotency for POST endpoints using the Idempotency-Key header.
 *
 * Strategy:
 * 1. Check if we've seen this key before (stored in IdempotencyRecord table)
 * 2. If yes → return the cached response immediately (no side effects)
 * 3. If no → execute the handler, store the result, return it
 *
 * We use Postgres for storage rather than Redis to keep the free-tier setup
 * simple. Redis would be preferable in production for lower latency and TTL
 * support. The record is stored with the key, status code, and serialised body.
 *
 * Race condition on idempotency itself:
 * Two concurrent requests with the same key could both find "no record" and
 * both proceed. We mitigate this with a unique constraint on the key column —
 * the second INSERT will fail with a Prisma unique constraint error, at which
 * point we fetch and return the stored record.
 */

import { prisma } from "./prisma";
import { NextResponse } from "next/server";

export async function withIdempotency<T>(
  idempotencyKey: string | null | undefined,
  handler: () => Promise<{ status: number; body: T }>
): Promise<NextResponse> {
  // If no key provided, just run the handler
  if (!idempotencyKey) {
    const { status, body } = await handler();
    return NextResponse.json(body, { status });
  }

  // Check for existing record
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  });

  if (existing) {
    return NextResponse.json(existing.body, {
      status: existing.statusCode,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  // Execute the actual handler
  const { status, body } = await handler();

  // Persist the result (ignore unique constraint errors from concurrent requests)
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key: idempotencyKey,
        statusCode: status,
        body: body as object,
      },
    });
  } catch (e: unknown) {
    // Unique constraint violation — concurrent request already stored the result
    // Fetch and return whatever was stored
    const race = await prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (race) {
      return NextResponse.json(race.body, {
        status: race.statusCode,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
    // If we somehow still can't find it, fall through and return the result
    console.error("Idempotency race condition — could not store or retrieve:", e);
  }

  return NextResponse.json(body, { status });
}
