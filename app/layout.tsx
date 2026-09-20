import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JStore Digital — Manajemen Stok",
  description: "Kelola produk digital, stok akun dan link, serta penjualan JStore Digital dalam satu tempat.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
