import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatTimeRemaining(expiresAt: string): {
  seconds: number;
  display: string;
  isUrgent: boolean;
  isExpired: boolean;
} {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return {
    seconds,
    display: `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`,
    isUrgent: seconds < 120, // last 2 minutes
    isExpired: seconds === 0,
  };
}
