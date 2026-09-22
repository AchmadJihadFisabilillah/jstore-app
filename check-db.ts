import { getInventoryDb, ensureDbSchema } from "./db/index.js";
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
  await ensureDbSchema(db);
  
  // check indexes
  const result = await db.prepare("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'stocks';").all();
  console.log("Indexes on stocks:");
  console.log(result.results);
}

main().catch(console.error).finally(() => process.exit(0));
