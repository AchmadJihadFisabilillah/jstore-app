import { categories } from "./inventory";

export interface ParsedProductRow {
  name: string;
  category: string;
  type: "account" | "link" | "license" | "other";
  duration: string;
  price: number;
  cost: number;
  minStock: number;
  resellerPrice: number | null;
  warrantyHours: number;
  initialStock?: string[];
}

export interface ProductImportIssue {
  line: number;
  raw: string;
  reason: string;
}

export interface BulkProductParseResult {
  valid: ParsedProductRow[];
  issues: ProductImportIssue[];
}

export const PRODUCT_CSV_TEMPLATE = `Nama Produk,Kategori,Varian/Durasi,Jenis,Harga Jual,Modal,Harga Reseller,Garansi Jam,Min Stok,Kredensial Akun (Opsional)
Netflix Premium 4K,Streaming,1 Bulan,account,25000,18000,23000,24,5,user1@netflix.com|Pass123 ; user2@netflix.com|Pass456
Spotify Premium Individual,Musik,3 Bulan,account,15000,9000,13000,72,10,user_spotify@gmail.com:Secret789
Canva Pro Lifetime / Edu,Editing & Desain,Lifetime,link,10000,4000,8000,0,10,https://www.canva.com/brand/join?token=abc12345
CapCut Pro Private,Editing & Desain,1 Bulan,account,22000,15000,20000,24,5,capcut_pro@mail.com|PassCap99
VPN Express 1 Bulan,Utility,1 Bulan,license,45000,25000,40000,24,2,EXP-VPN-KEY-9948-2849
Gemini Advanced AI,AI & Produktivitas,1 Bulan,account,35000,25000,32000,48,5,gemini_ai@gmail.com|AiPass2026
YouTube Premium Family,Streaming,1 Bulan,link,12000,6000,10000,0,5,https://youtube.com/premium/family/invite`;

function cleanNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  let str = String(val).trim().toLowerCase();
  if (!str || str === "-" || str === "null") return null;

  // Handle 'k' / 'rb' / 'ribu' e.g. '15k' -> 15000
  if (str.endsWith("k") || str.endsWith("rb")) {
    const num = parseFloat(str.replace(/[k|rb]/g, "").trim().replace(/,/g, "."));
    return isNaN(num) ? null : Math.round(num * 1000);
  }
  if (str.endsWith("jt") || str.endsWith("m")) {
    const num = parseFloat(str.replace(/[jt|m]/g, "").trim().replace(/,/g, "."));
    return isNaN(num) ? null : Math.round(num * 1000000);
  }

  // Remove currency, spaces, dots as thousand separators
  str = str.replace(/rp\.?/g, "").replace(/\s+/g, "");
  // If format like 25.000 -> 25000
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, "");
  } else if (/^\d+,\d+$/.test(str)) {
    str = str.replace(/,/g, ".");
  }

  const parsed = Number(str);
  return isNaN(parsed) ? null : Math.round(parsed);
}

function normalizeCategory(cat: string): string {
  const c = cat.trim().toLowerCase();
  for (const item of categories) {
    if (item.toLowerCase() === c) return item;
  }
  if (c.includes("ai") || c.includes("produk") || c.includes("bot")) return "AI & Produktivitas";
  if (c.includes("edit") || c.includes("desain") || c.includes("design") || c.includes("canva") || c.includes("video")) return "Editing & Desain";
  if (c.includes("musik") || c.includes("music") || c.includes("lagu") || c.includes("spotify")) return "Musik";
  if (c.includes("stream") || c.includes("film") || c.includes("nonton") || c.includes("netflix") || c.includes("yt") || c.includes("youtube")) return "Streaming";
  return "Lainnya";
}

function normalizeType(typeStr: string): "account" | "link" | "license" | "other" {
  const t = typeStr.trim().toLowerCase();
  if (t.includes("link") || t.includes("tautan") || t.includes("url")) return "link";
  if (t.includes("licen") || t.includes("key") || t.includes("kode") || t.includes("lisensi")) return "license";
  if (t.includes("other") || t.includes("lain")) return "other";
  return "account";
}

function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseProductBulkInput(input: string): BulkProductParseResult {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: BulkProductParseResult = { valid: [], issues: [] };

  if (!lines.length) return result;

  // Detect delimiter: comma, semicolon, tab, or pipe
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";")) delimiter = ";";
  else if (firstLine.includes("|")) delimiter = "|";

  // Check if first row is a header
  let startIdx = 0;
  const headerCols = splitLine(firstLine, delimiter).map(c => c.toLowerCase());
  const hasHeader = headerCols.some(h =>
    h.includes("nama") || h.includes("produk") || h.includes("harga") || h.includes("kategori") || h.includes("name") || h.includes("price")
  );

  let colMap: Record<string, number> = {
    name: 0,
    category: 1,
    duration: 2,
    type: 3,
    price: 4,
    cost: 5,
    resellerPrice: 6,
    warrantyHours: 7,
    minStock: 8,
    initialStock: 9,
  };

  if (hasHeader) {
    startIdx = 1;
    // Try to detect mapped indexes
    headerCols.forEach((col, idx) => {
      if (col.includes("nama") || col.includes("product") || col.includes("name")) colMap.name = idx;
      else if (col.includes("kategori") || col.includes("category")) colMap.category = idx;
      else if (col.includes("durasi") || col.includes("varian") || col.includes("duration") || col.includes("variant")) colMap.duration = idx;
      else if (col.includes("jenis") || col.includes("tipe") || col.includes("type")) colMap.type = idx;
      else if (col.includes("reseller")) colMap.resellerPrice = idx;
      else if (col.includes("modal") || col.includes("cost") || col.includes("beli")) colMap.cost = idx;
      else if (col.includes("jual") || col.includes("harga") || col.includes("price")) colMap.price = idx;
      else if (col.includes("garansi") || col.includes("warranty")) colMap.warrantyHours = idx;
      else if (col.includes("min") || col.includes("stok min") || col.includes("minimum")) colMap.minStock = idx;
      else if (col.includes("cred") || col.includes("akun") || col.includes("stok") || col.includes("stock") || col.includes("data") || col.includes("pass")) colMap.initialStock = idx;
    });
  }

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;
    const cols = splitLine(raw, delimiter);

    if (cols.length < 2) {
      result.issues.push({ line: lineNum, raw, reason: "Format kolom tidak lengkap (minimal Nama dan Harga)." });
      continue;
    }

    const name = (cols[colMap.name] || "").trim();
    if (!name) {
      result.issues.push({ line: lineNum, raw, reason: "Nama produk wajib diisi." });
      continue;
    }

    const categoryRaw = cols[colMap.category] || "Lainnya";
    const category = normalizeCategory(categoryRaw);

    const duration = (cols[colMap.duration] || "1 Bulan").trim();

    const typeRaw = cols[colMap.type] || "account";
    const type = normalizeType(typeRaw);

    const price = cleanNumber(cols[colMap.price]);
    if (price === null || price < 0) {
      result.issues.push({ line: lineNum, raw, reason: `Harga jual '${cols[colMap.price] || ""}' tidak valid.` });
      continue;
    }

    const costRaw = cols[colMap.cost];
    const cost = costRaw !== undefined && costRaw !== "" ? cleanNumber(costRaw) : Math.round(price * 0.7);
    if (cost === null || cost < 0) {
      result.issues.push({ line: lineNum, raw, reason: `Modal '${costRaw}' tidak valid.` });
      continue;
    }

    const resellerRaw = cols[colMap.resellerPrice];
    const resellerPrice = resellerRaw !== undefined && resellerRaw !== "" ? cleanNumber(resellerRaw) : null;

    const warrantyRaw = cols[colMap.warrantyHours];
    const warrantyHours = warrantyRaw !== undefined && warrantyRaw !== "" ? (cleanNumber(warrantyRaw) ?? 0) : 0;

    const minStockRaw = cols[colMap.minStock];
    const minStock = minStockRaw !== undefined && minStockRaw !== "" ? (cleanNumber(minStockRaw) ?? 10) : 10;

    // Parse initial credentials / stock if present in row
    let initialStock: string[] | undefined = undefined;
    const credRaw = cols[colMap.initialStock];
    if (credRaw && credRaw.trim()) {
      // Support separation by semicolon (;) or newline (\n) or double pipe (||)
      const rawLines = credRaw.split(/;|\r?\n|\|\|/).map(s => s.trim()).filter(Boolean);
      if (rawLines.length > 0) {
        initialStock = rawLines;
      }
    }

    result.valid.push({
      name,
      category,
      type,
      duration,
      price,
      cost,
      minStock,
      resellerPrice,
      warrantyHours,
      initialStock,
    });
  }

  return result;
}
