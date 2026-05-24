import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";


export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Multi-warehouse inventory management with race-condition-free reservations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <span className="text-white text-xs font-bold">A</span>
              </div>
              <span className="font-semibold text-sm tracking-tight">Allo Inventory</span>
            </a>
            <span className="text-xs text-muted-foreground font-mono">
              multi-warehouse · race-safe
            </span>
          </div>
        </nav>
        <main className="min-h-screen">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
