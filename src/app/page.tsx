"use client";

import { useState, useEffect } from "react";
import { ProductCard } from "@/components/product-card";
import type { ProductWithStock } from "@/lib/schemas";

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
    // Poll every 5 seconds for live stock updates
    const interval = setInterval(fetchProducts, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground text-sm">Loading inventory...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8 animate-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-1 w-6 bg-primary rounded-full" />
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Live Inventory
          </span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reserve items for 10 minutes while you complete checkout. Stock updates live.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product, i) => (
          <div
            key={product.id}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}