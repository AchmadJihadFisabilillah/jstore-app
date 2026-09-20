import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env.local", ".env", ".env.production"]) {
    const full = path.resolve(process.cwd(), file);
    if (fs.existsSync(full)) {
      const match = fs.readFileSync(full, "utf-8").match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
      if (match) return match[1];
    }
  }
  return "postgresql://jstore_app:JStoreApp2026!Pass@db.wekxnzbfhwabexrnmwon.supabase.co:5432/postgres?sslmode=require";
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
