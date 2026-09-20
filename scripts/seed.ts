/**
 * JStore Digital — Database Seeder
 *
 * Seeds the Supabase PostgreSQL database with sample data:
 * - Owner + Admin user accounts
 * - 5 sample products
 * - 10 stock items per product
 * - 5 sample sales transactions
 * - Activity log entries
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(file: string) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Load .env.local and .env
loadEnvFile(".env.local");
loadEnvFile(".env");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Add it to .env.local");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

function uuid(): string {
  return crypto.randomUUID();
}

const now = new Date().toISOString();
const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const future = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function seed() {
  console.log("🌱 Starting database seed...\n");

  // ---- 1. Run migration first ----
  console.log("📦 Running migration...");
  const fs = await import("fs");
  const path = await import("path");
  const migrationPath = path.join(process.cwd(), "drizzle", "0000_initial_pg.sql");
  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    await sql.unsafe(migrationSql);
    console.log("   ✅ Migration applied\n");
  } else {
    console.log("   ⚠️  Migration file not found, assuming tables exist\n");
  }

  // ---- 2. Clean existing data (reverse dependency order) ----
  console.log("🧹 Cleaning existing data...");
  await sql`DELETE FROM "warrantyClaims"`;
  await sql`DELETE FROM stocks`;
  await sql`DELETE FROM sales`;
  await sql`DELETE FROM activities`;
  await sql`DELETE FROM products`;
  await sql`DELETE FROM "appUsers"`;
  console.log("   ✅ All tables cleaned\n");

  // ---- 3. Seed Users ----
  console.log("👤 Seeding users...");
  const ownerId = uuid();
  const adminId = `admin-${uuid().slice(0, 8)}`;

  await sql`INSERT INTO "appUsers" ("id", "username", "name", "password", "role", "createdAt")
    VALUES (${ownerId}, 'owner', 'Owner', 'owner123', 'owner', ${daysAgo(30)})`;

  await sql`INSERT INTO "appUsers" ("id", "username", "name", "password", "role", "createdAt")
    VALUES (${adminId}, 'admin1', 'Admin Toko', 'admin123', 'admin', ${daysAgo(28)})`;

  console.log("   ✅ Owner: username=owner, password=owner123");
  console.log("   ✅ Admin: username=admin1, password=admin123\n");

  // ---- 4. Seed Products ----
  console.log("📦 Seeding products...");
  type ProductSeed = {
    id: string;
    name: string;
    category: string;
    type: string;
    duration: string;
    price: number;
    cost: number;
    minStock: number;
    resellerPrice: number | null;
    warrantyHours: number;
  };

  const products: ProductSeed[] = [
    { id: uuid(), name: "Gemini Pro", category: "AI & Produktivitas", type: "link", duration: "18 bulan", price: 10000, cost: 7000, minStock: 10, resellerPrice: 9000, warrantyHours: 24 },
    { id: uuid(), name: "CapCut Pro", category: "Editing & Desain", type: "account", duration: "7 hari", price: 2000, cost: 1200, minStock: 10, resellerPrice: 1700, warrantyHours: 24 },
    { id: uuid(), name: "Spotify Premium", category: "Musik", type: "account", duration: "3 bulan", price: 4500, cost: 3000, minStock: 10, resellerPrice: 4000, warrantyHours: 48 },
    { id: uuid(), name: "Netflix Premium", category: "Streaming", type: "account", duration: "1 bulan", price: 25000, cost: 19000, minStock: 5, resellerPrice: 22000, warrantyHours: 72 },
    { id: uuid(), name: "Canva Pro", category: "Editing & Desain", type: "link", duration: "1 bulan", price: 8000, cost: 4000, minStock: 5, resellerPrice: 7000, warrantyHours: 24 },
  ];

  for (const p of products) {
    await sql`INSERT INTO products ("id", "name", "category", "type", "duration", "price", "cost", "minStock", "resellerPrice", "warrantyHours", "createdAt")
      VALUES (${p.id}, ${p.name}, ${p.category}, ${p.type}, ${p.duration}, ${p.price}, ${p.cost}, ${p.minStock}, ${p.resellerPrice}, ${p.warrantyHours}, ${daysAgo(14)})`;
    console.log(`   ✅ ${p.name} — ${p.duration} (Rp${p.price.toLocaleString("id-ID")})`);
  }
  console.log();

  // ---- 5. Seed Stocks ----
  console.log("📋 Seeding stocks (10 per product)...");
  let totalStocks = 0;

  for (const p of products) {
    const batch = uuid();
    for (let i = 1; i <= 10; i++) {
      const value = p.type === "link"
        ? `https://example.com/${p.name.toLowerCase().replace(/\s/g, "-")}/invite-${i}`
        : `user${i}@${p.name.toLowerCase().replace(/\s/g, "")}.example.com|password-${i}-secret`;
      const expiresAt = p.name === "Gemini Pro" && i <= 3 ? future(3) : null;

      await sql`INSERT INTO stocks ("id", "productId", "value", "cost", "expiresAt", "state", "batchId", "createdAt")
        VALUES (${uuid()}, ${p.id}, ${value}, ${p.cost}, ${expiresAt}, 'ready', ${batch}, ${daysAgo(7, i)})`;
      totalStocks++;
    }
  }
  console.log(`   ✅ ${totalStocks} stock items created\n`);

  // ---- 6. Seed Sales ----
  console.log("💰 Seeding sample sales...");
  const saleEntries = [
    { product: products[0], qty: 3, customer: "Pelanggan Andi", daysAgo: 5 },
    { product: products[1], qty: 5, customer: "Reseller Budi", daysAgo: 4 },
    { product: products[2], qty: 2, customer: "Pelanggan Citra", daysAgo: 3 },
    { product: products[3], qty: 1, customer: "Pelanggan Dewi", daysAgo: 2 },
    { product: products[4], qty: 4, customer: "Reseller Eko", daysAgo: 1 },
  ];

  for (const entry of saleEntries) {
    const saleId = uuid();
    const createdAt = daysAgo(entry.daysAgo);
    const total = entry.product.price * entry.qty;
    const cost = entry.product.cost * entry.qty;
    const warrantyUntil = entry.product.warrantyHours
      ? new Date(Date.parse(createdAt) + entry.product.warrantyHours * 3600000).toISOString()
      : null;

    await sql`INSERT INTO sales ("id", "productId", "productName", "quantity", "total", "cost", "customer", "createdAt", "kind", "actorId", "actorName", "reference", "requestFingerprint", "originalSaleId", "warrantyUntil")
      VALUES (${saleId}, ${entry.product.id}, ${entry.product.name + " · " + entry.product.duration}, ${entry.qty}, ${total}, ${cost}, ${entry.customer}, ${createdAt}, 'sale', ${adminId}, 'Admin Toko', '', '', NULL, ${warrantyUntil})`;

    // Update stocks for this sale
    const readyStocks = await sql`SELECT "id" FROM stocks WHERE "productId" = ${entry.product.id} AND "state" = 'ready' ORDER BY "createdAt" LIMIT ${entry.qty}`;
    for (const stock of readyStocks) {
      await sql`UPDATE stocks SET "state" = 'sold', "saleId" = ${saleId} WHERE "id" = ${stock.id}`;
    }

    // Activity log
    await sql`INSERT INTO activities ("id", "kind", "message", "quantity", "createdAt")
      VALUES (${uuid()}, 'sale', ${entry.product.name + " · " + entry.product.duration + " · Admin Toko"}, ${entry.qty}, ${createdAt})`;

    console.log(`   ✅ ${entry.customer}: ${entry.qty}x ${entry.product.name} = Rp${total.toLocaleString("id-ID")}`);
  }
  console.log();

  // ---- 7. Seed Activities (restock entries) ----
  console.log("📝 Seeding activity log...");
  for (const p of products) {
    await sql`INSERT INTO activities ("id", "kind", "message", "quantity", "createdAt")
      VALUES (${uuid()}, 'restock', ${p.name + " · " + p.duration + " · Owner"}, 10, ${daysAgo(7)})`;
  }
  await sql`INSERT INTO activities ("id", "kind", "message", "quantity", "createdAt")
    VALUES (${uuid()}, 'product', ${"Setup awal: 5 produk · Owner"}, 5, ${daysAgo(14)})`;
  console.log("   ✅ Activity log seeded\n");

  // ---- Summary ----
  const counts = {
    users: (await sql`SELECT COUNT(*) as count FROM "appUsers"`)[0].count,
    products: (await sql`SELECT COUNT(*) as count FROM products`)[0].count,
    stocks: (await sql`SELECT COUNT(*) as count FROM stocks`)[0].count,
    sales: (await sql`SELECT COUNT(*) as count FROM sales`)[0].count,
    activities: (await sql`SELECT COUNT(*) as count FROM activities`)[0].count,
  };

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✨ Seed complete!");
  console.log(`   👤 Users:      ${counts.users}`);
  console.log(`   📦 Products:   ${counts.products}`);
  console.log(`   📋 Stocks:     ${counts.stocks}`);
  console.log(`   💰 Sales:      ${counts.sales}`);
  console.log(`   📝 Activities: ${counts.activities}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await sql.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
