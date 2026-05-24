"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReservationResponse } from "@/lib/schemas";
import { formatCurrency, formatTimeRemaining, cn } from "@/lib/utils";

interface Props {
  reservation: ReservationResponse;
}

type UIStatus = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";

function CountdownTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [display, setDisplay] = useState("10:00");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [pct, setPct] = useState(100);

  useEffect(() => {
    const totalMs = new Date(expiresAt).getTime() - Date.now();
    const totalSecs = Math.max(0, Math.floor(totalMs / 1000));

    const tick = () => {
      const t = formatTimeRemaining(expiresAt);
      setDisplay(t.display);
      setIsUrgent(t.isUrgent);
      setPct((t.seconds / (10 * 60)) * 100);
      if (t.isExpired && !isExpired) {
        setIsExpired(true);
        onExpire();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire, isExpired]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Progress ring */}
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted"
          />
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
            className={cn(
              "transition-all duration-1000",
              isUrgent ? "text-destructive" : "text-primary"
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-xl font-mono font-semibold tabular-nums",
              isUrgent && "text-destructive countdown-urgent"
            )}
          >
            {display}
          </span>
          <span className="text-xs text-muted-foreground">remaining</span>
        </div>
      </div>
      {isUrgent && !isExpired && (
        <p className="text-xs text-destructive font-medium animate-pulse text-center">
          ⚠ Hurry — your reservation expires soon
        </p>
      )}
    </div>
  );
}

export function CheckoutClient({ reservation: initial }: Props) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [status, setStatus] = useState<UIStatus>(initial.status);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExpire = useCallback(() => {
    if (status === "PENDING") setStatus("EXPIRED");
  }, [status]);

  async function handleConfirm() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": `confirm-${reservation.id}` },
      });
      const data = await res.json();

      if (res.status === 410) {
        setStatus("EXPIRED");
        setError("Your reservation expired before payment could be confirmed.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not confirm reservation. Please try again.");
        return;
      }
      setReservation(data);
      setStatus("CONFIRMED");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not cancel. Please try again.");
        return;
      }
      setReservation(data);
      setStatus("RELEASED");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const isTerminal = status !== "PENDING";

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <button onClick={() => router.push("/")} className="hover:text-foreground transition-colors">
          Products
        </button>
        <span>/</span>
        <span className="text-foreground">Checkout</span>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
        {/* Product summary */}
        <div className="flex items-center gap-4 p-5 border-b border-border">
          {reservation.product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reservation.product.imageUrl}
              alt={reservation.product.name}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm leading-tight truncate">
              {reservation.product.name}
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {reservation.product.sku}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-semibold text-primary">
                {formatCurrency(reservation.product.price)}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                Qty: {reservation.quantity}
              </span>
            </div>
          </div>
        </div>

        {/* Warehouse info */}
        <div className="px-5 py-3 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{reservation.warehouse.name} · {reservation.warehouse.location}</span>
          </div>
        </div>

        {/* Status / countdown area */}
        <div className="p-6">
          {status === "PENDING" && (
            <div className="flex flex-col items-center gap-4 animate-fade-up">
              <CountdownTimer expiresAt={reservation.expiresAt} onExpire={handleExpire} />
              <div className="text-center space-y-1">
                <p className="text-xs font-medium">Reservation held</p>
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {reservation.id.slice(0, 12)}…
                </p>
              </div>
            </div>
          )}

          {status === "CONFIRMED" && (
            <div className="flex flex-col items-center gap-3 py-2 animate-fade-up">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-green-700">Order Confirmed</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirmed at{" "}
                  {reservation.confirmedAt
                    ? new Date(reservation.confirmedAt).toLocaleTimeString()
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {(status === "RELEASED" || status === "EXPIRED") && (
            <div className="flex flex-col items-center gap-3 py-2 animate-fade-up">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-muted-foreground">
                  {status === "EXPIRED" ? "Reservation Expired" : "Reservation Cancelled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {status === "EXPIRED"
                    ? "The 10-minute window has passed. Inventory has been released."
                    : "Your hold has been released. Items are available again."}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          {!isTerminal && (
            <div className="flex flex-col gap-2.5 mt-6">
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={cn(
                  "w-full rounded-xl py-3 text-sm font-semibold transition-all duration-150",
                  isLoading
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-sm"
                )}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing…
                  </span>
                ) : (
                  "Confirm Purchase"
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={isLoading}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150 border border-border"
              >
                Cancel
              </button>
            </div>
          )}

          {isTerminal && (
            <div className="mt-6">
              <button
                onClick={() => router.push("/")}
                className="w-full rounded-xl py-2.5 text-sm font-medium bg-muted hover:bg-muted/70 transition-colors"
              >
                ← Back to Products
              </button>
            </div>
          )}
        </div>

        {/* Reservation meta */}
        <div className="px-5 py-3 bg-muted/30 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>Created {new Date(reservation.createdAt).toLocaleTimeString()}</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                status === "CONFIRMED" && "bg-green-100 text-green-700",
                status === "PENDING" && "bg-amber-100 text-amber-700",
                (status === "RELEASED" || status === "EXPIRED") && "bg-muted text-muted-foreground"
              )}
            >
              {status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
