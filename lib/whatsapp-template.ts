import { formatDate, money } from "./inventory";

export const DEFAULT_WA_TEMPLATE = `Halo kak {customer}, terima kasih sudah order di JStore Digital! ✨

📦 Produk: {product}
🔑 Detail Akun / Link:
{credentials}
{warranty}
Jika ada kendala silakan hubungi kami. Terima kasih! 🙏`;

export type WaTemplateContext = {
  customer?: string;
  productName: string;
  duration?: string;
  credentials: string; // text lines
  warrantyUntil?: string | null;
  orderId?: string;
  total?: number;
  actorName?: string;
  createdAt?: string;
};

export const WA_TEMPLATE_TAGS = [
  { tag: "{customer}", label: "Nama Pelanggan", desc: "Nama pembeli / username" },
  { tag: "{product}", label: "Produk & Varian", desc: "Contoh: Netflix · 1 Bulan" },
  { tag: "{credentials}", label: "Detail Akun / Link", desc: "Daftar kredensial yang dialokasikan" },
  { tag: "{warranty}", label: "Info Garansi", desc: "Baris garansi (kosong jika tanpa garansi)" },
  { tag: "{order_id}", label: "ID Pesanan", desc: "Kode referensi transaksi (#ABC12345)" },
  { tag: "{total}", label: "Total Pembayaran", desc: "Nominal rupiah (mis. Rp25.000)" },
  { tag: "{date}", label: "Tanggal Transaksi", desc: "Waktu transaksi WIB" },
  { tag: "{admin}", label: "Nama Admin", desc: "Petugas yang mengambil stok" },
];

export function formatWhatsAppMessage(
  template: string | null | undefined,
  ctx: WaTemplateContext,
  defaultTemplate: string = DEFAULT_WA_TEMPLATE
): string {
  const tpl = (template && template.trim()) ? template : (defaultTemplate && defaultTemplate.trim() ? defaultTemplate : DEFAULT_WA_TEMPLATE);

  const customerName = (ctx.customer || "").trim();
  const orderId = ctx.orderId ? (ctx.orderId.startsWith("#") ? ctx.orderId : `#${ctx.orderId.replace("demo-sale-","CONTOH-").slice(0, 10).toUpperCase()}`) : "";
  const totalFormatted = ctx.total !== undefined ? money(ctx.total) : "";
  const dateFormatted = ctx.createdAt ? formatDate(ctx.createdAt, true) + " WIB" : "";
  const warrantyText = ctx.warrantyUntil
    ? `\n🛡️ Garansi s.d: ${formatDate(ctx.warrantyUntil, true)} WIB\n`
    : "";
  const warrantyDateOnly = ctx.warrantyUntil ? `${formatDate(ctx.warrantyUntil, true)} WIB` : "";

  let result = tpl;

  // Replace all aliases
  const replacements: [RegExp, string][] = [
    [/\{customer\}|\{pelanggan\}|\{nama\}/gi, customerName],
    [/\{product\}|\{produk\}|\{nama_produk\}/gi, ctx.productName || ""],
    [/\{duration\}|\{durasi\}/gi, ctx.duration || ""],
    [/\{credentials\}|\{detail_akun\}|\{akun\}|\{link\}|\{stok\}/gi, ctx.credentials || ""],
    [/\{warranty\}|\{garansi\}/gi, warrantyText],
    [/\{warranty_until\}|\{batas_garansi\}/gi, warrantyDateOnly],
    [/\{order_id\}|\{id_pesanan\}|\{invoice\}|\{transaksi\}/gi, orderId],
    [/\{total\}|\{nominal\}|\{harga\}/gi, totalFormatted],
    [/\{date\}|\{tanggal\}/gi, dateFormatted],
    [/\{admin\}|\{petugas\}/gi, ctx.actorName || "Admin"],
  ];

  for (const [pattern, val] of replacements) {
    result = result.replace(pattern, val);
  }

  // Clean up formatting issues like "Halo kak ," -> "Halo kak,"
  result = result.replace(/kak\s+,/gi, "kak,");
  // Clean up extra multiple blank lines (more than 2 consecutive newlines)
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}
