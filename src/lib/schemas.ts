import { z } from "zod";

// ─── Request Schemas ─────────────────────────────────────────────────────────

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// ─── Response Types ───────────────────────────────────────────────────────────

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED";

export interface ProductWithStock {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: string;
  imageUrl: string | null;
  stock: {
    warehouseId: string;
    warehouseName: string;
    location: string;
    total: number;
    reserved: number;
    available: number;
  }[];
}

export interface WarehouseResponse {
  id: string;
  name: string;
  location: string;
}

export interface ReservationResponse {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    price: string;
    imageUrl: string | null;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface ApiError {
  error: string;
  code?: string;
}
