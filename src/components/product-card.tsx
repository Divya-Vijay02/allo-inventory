"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductWithStock } from "@/lib/schemas";
import { formatCurrency, cn } from "@/lib/utils";

interface Props {
  product: ProductWithStock;
}

function StockBadge({ available }: { available: number }) {
  if (available === 0)
    return (
      <span className="stock-badge-out text-xs px-2 py-0.5 rounded-full font-mono">
        Out of stock
      </span>
    );
  if (available <= 2)
    return (
      <span className="stock-badge-low text-xs px-2 py-0.5 rounded-full font-mono">
        {available} left
      </span>
    );
  if (available <= 5)
    return (
      <span className="stock-badge-medium text-xs px-2 py-0.5 rounded-full font-mono">
        {available} available
      </span>
    );
  return (
    <span className="stock-badge-high text-xs px-2 py-0.5 rounded-full font-mono">
      {available} in stock
    </span>
  );
}

export function ProductCard({ product }: Props) {
  const router = useRouter();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    product.stock[0]?.warehouseId ?? ""
  );
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStock = product.stock.find((s) => s.warehouseId === selectedWarehouseId);
  const canReserve = (selectedStock?.available ?? 0) > 0;

  async function handleReserve() {
    if (!canReserve || !selectedWarehouseId) return;
    setIsReserving(true);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Generate a random idempotency key per attempt
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          quantity: 1,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setError("Sorry — this item just sold out. Try another warehouse.");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Failed to create reservation. Please try again.");
        return;
      }

      // Navigate to checkout with the reservation
      router.push(`/checkout/${data.id}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsReserving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col">
      {/* Image */}
      {product.imageUrl && (
        <div className="aspect-[4/3] bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Product info */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-sm leading-tight">{product.name}</h2>
            <span className="text-sm font-semibold text-primary whitespace-nowrap">
              {formatCurrency(product.price)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {product.description}
          </p>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1">SKU: {product.sku}</p>
        </div>

        {/* Warehouse selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Ship from</label>
          <div className="flex flex-col gap-1.5">
            {product.stock.map((s) => (
              <button
                key={s.warehouseId}
                onClick={() => setSelectedWarehouseId(s.warehouseId)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all text-left",
                  selectedWarehouseId === s.warehouseId
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                )}
              >
                <div>
                  <span className="font-medium">{s.warehouseName}</span>
                  <span className="text-muted-foreground ml-1.5">{s.location}</span>
                </div>
                <StockBadge available={s.available} />
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Reserve button */}
        <button
          onClick={handleReserve}
          disabled={!canReserve || isReserving}
          className={cn(
            "mt-auto w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150",
            canReserve && !isReserving
              ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isReserving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Reserving...
            </span>
          ) : canReserve ? (
            "Reserve · Checkout"
          ) : (
            "Out of Stock"
          )}
        </button>
      </div>
    </div>
  );
}
