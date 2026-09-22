import { getInventoryDb } from "./db/index.js";
import postgres from "postgres";
import fs from "fs";
import path from "path";

// load env
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
}

async function main() {
  const db = getInventoryDb();
  
  // Find a product
  const products = await db.prepare("SELECT * FROM products LIMIT 1").all();
  if (products.results.length === 0) {
    console.log("No products found.");
    return;
  }
  const pid = products.results[0].id;
  
  const now = new Date().toISOString();
  const batch = "test-batch";
  const duplicateValue = "duplicate@test.com|pass";
  
  console.log("Inserting first...");
  const res1 = await db.prepare('INSERT INTO stocks ("id","productId","value","cost","state","batchId","createdAt") VALUES ($1,$2,$3,$4,\'ready\',$5,$6)')
    .bind(crypto.randomUUID(), pid, duplicateValue, 1000, batch, now).run();
  console.log("First insert:", res1.meta.changes);
  
  console.log("Inserting duplicate...");
  try {
    const res2 = await db.prepare('INSERT INTO stocks ("id","productId","value","cost","state","batchId","createdAt") VALUES ($1,$2,$3,$4,\'ready\',$5,$6)')
      .bind(crypto.randomUUID(), pid, duplicateValue, 1000, batch, now).run();
    console.log("Second insert:", res2.meta.changes);
    console.log("SUCCESS! Duplicates allowed.");
  } catch (err) {
    console.error("FAILED! Duplicate error:", err);
  }
}

main().catch(console.error).finally(() => process.exit(0));
