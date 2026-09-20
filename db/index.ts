import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// PostgreSQL connection (singleton)
// ---------------------------------------------------------------------------

const DEFAULT_DATABASE_URL =
  "postgresql://jstore_app.wekxnzbfhwabexrnmwon:JStoreApp2026!Pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
    sqlClient = postgres(url, { max: 10 });
  }
  return sqlClient;
}

// ---------------------------------------------------------------------------
// Drizzle ORM instance (for typed queries if needed)
// ---------------------------------------------------------------------------

export function getDb() {
  return drizzle(getSql(), { schema });
}

// ---------------------------------------------------------------------------
// D1-compatible wrapper
// ---------------------------------------------------------------------------
// All existing API routes use raw D1 API: db.prepare(sql).bind(...).first()
// This wrapper translates those calls to PostgreSQL via the `postgres` driver.
// ---------------------------------------------------------------------------

/**
 * Convert SQLite-style `?` placeholders to PostgreSQL `$1, $2, ...` style.
 * Also converts `INSERT OR IGNORE` to `ON CONFLICT DO NOTHING`.
 */
function convertSql(sql: string): string {
  // INSERT OR IGNORE → ON CONFLICT DO NOTHING
  let converted = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  const needsOnConflict = sql.match(/INSERT\s+OR\s+IGNORE/i);

  // Replace ? placeholders with $1, $2, ...
  let idx = 0;
  converted = converted.replace(/\?/g, () => `$${++idx}`);

  // Add ON CONFLICT DO NOTHING at end of INSERT ... VALUES (...)
  if (needsOnConflict) {
    // Find the closing paren of VALUES clause or end of statement
    converted = converted.replace(
      /(VALUES\s*\([^)]*\))/i,
      "$1 ON CONFLICT DO NOTHING"
    );
  }

  return converted;
}

interface PgResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
    rows_read: number;
    rows_written: number;
  };
}

interface PgPreparedStatement {
  sql: string;
  params: unknown[];
  bind(...values: unknown[]): PgPreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<PgResult<T>>;
  run<T = Record<string, unknown>>(): Promise<PgResult<T>>;
}

function createPreparedStatement(
  originalSql: string,
  sqlInstance: ReturnType<typeof postgres>
): PgPreparedStatement {
  const convertedSql = convertSql(originalSql);

  const stmt: PgPreparedStatement = {
    sql: originalSql,
    params: [],

    bind(...values: unknown[]) {
      stmt.params = values;
      return stmt;
    },

    async first<T = Record<string, unknown>>(
      _column?: string
    ): Promise<T | null> {
      const result = await sqlInstance.unsafe(convertedSql, stmt.params as any);
      if (result.length === 0) return null;
      return result[0] as T;
    },

    async all<T = Record<string, unknown>>(): Promise<PgResult<T>> {
      const result = await sqlInstance.unsafe(convertedSql, stmt.params as any);
      return {
        results: Array.from(result) as T[],
        success: true,
        meta: {
          changes: result.count ?? 0,
          last_row_id: 0,
          duration: 0,
          rows_read: result.length,
          rows_written: 0,
        },
      };
    },

    async run<T = Record<string, unknown>>(): Promise<PgResult<T>> {
      const result = await sqlInstance.unsafe(convertedSql, stmt.params as any);
      return {
        results: Array.from(result) as T[],
        success: true,
        meta: {
          changes: result.count ?? 0,
          last_row_id: 0,
          duration: 0,
          rows_read: result.length,
          rows_written: 0,
        },
      };
    },
  };

  return stmt;
}

export interface CompatDb {
  prepare(sql: string): PgPreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: PgPreparedStatement[]
  ): Promise<PgResult<T>[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}

/**
 * Returns a D1-API-compatible database wrapper backed by PostgreSQL.
 * This allows all existing route handlers to work without structural changes.
 */
export function getInventoryDb(): CompatDb {
  const sql = getSql();

  return {
    prepare(sqlStr: string) {
      return createPreparedStatement(sqlStr, sql);
    },

    async batch<T = Record<string, unknown>>(
      statements: PgPreparedStatement[]
    ): Promise<PgResult<T>[]> {
      // Execute all statements in a transaction
      const results: PgResult<T>[] = [];

      // Use postgres.js transaction
      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          const convertedSql = convertSql(stmt.sql);
          const result = await tx.unsafe(convertedSql, stmt.params as any);
          results.push({
            results: Array.from(result) as T[],
            success: true,
            meta: {
              changes: result.count ?? 0,
              last_row_id: 0,
              duration: 0,
              rows_read: result.length,
              rows_written: 0,
            },
          });
        }
      });

      return results;
    },

    async exec(sqlStr: string) {
      const result = await sql.unsafe(sqlStr);
      return { count: result.count ?? 0, duration: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Schema initialization (no-op — managed by Drizzle migrations / Supabase)
// ---------------------------------------------------------------------------

let schemaInitialized = false;

export async function ensureDbSchema(_db?: unknown) {
  if (schemaInitialized) return;
  try {
    const sql = getSql();
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS products (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "duration" TEXT NOT NULL,
        "price" INTEGER NOT NULL,
        "cost" INTEGER NOT NULL,
        "minStock" INTEGER NOT NULL DEFAULT 10,
        "createdAt" TEXT NOT NULL,
        "resellerPrice" INTEGER,
        "warrantyHours" INTEGER NOT NULL DEFAULT 0,
        "waTemplate" TEXT
      );

      CREATE TABLE IF NOT EXISTS sales (
        "id" TEXT PRIMARY KEY NOT NULL,
        "productId" TEXT NOT NULL,
        "productName" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "total" INTEGER NOT NULL,
        "cost" INTEGER NOT NULL,
        "customer" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'sale',
        "actorId" TEXT NOT NULL DEFAULT '',
        "actorName" TEXT NOT NULL DEFAULT '',
        "reference" TEXT NOT NULL DEFAULT '',
        "requestFingerprint" TEXT NOT NULL DEFAULT '',
        "originalSaleId" TEXT,
        "warrantyUntil" TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sales_createdAt ON sales ("createdAt");
      CREATE INDEX IF NOT EXISTS idx_sales_originalSaleId ON sales ("originalSaleId");

      CREATE TABLE IF NOT EXISTS stocks (
        "id" TEXT PRIMARY KEY NOT NULL,
        "productId" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "cost" INTEGER NOT NULL,
        "expiresAt" TEXT,
        "state" TEXT NOT NULL DEFAULT 'ready',
        "saleId" TEXT REFERENCES sales("id"),
        "batchId" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_product_value ON stocks ("productId", "value");
      CREATE INDEX IF NOT EXISTS idx_stocks_product_state ON stocks ("productId", "state");
      CREATE INDEX IF NOT EXISTS idx_stocks_saleId ON stocks ("saleId");

      CREATE TABLE IF NOT EXISTS "warrantyClaims" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "originalSaleId" TEXT NOT NULL REFERENCES sales("id"),
        "originalStockId" TEXT NOT NULL REFERENCES stocks("id"),
        "replacementStockId" TEXT NOT NULL REFERENCES stocks("id"),
        "replacementSaleId" TEXT NOT NULL REFERENCES sales("id"),
        "reason" TEXT NOT NULL,
        "override" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_originalStockId ON "warrantyClaims" ("originalStockId");
      CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_replacementStockId ON "warrantyClaims" ("replacementStockId");
      CREATE INDEX IF NOT EXISTS idx_claims_originalSaleId ON "warrantyClaims" ("originalSaleId");

      CREATE TABLE IF NOT EXISTS activities (
        "id" TEXT PRIMARY KEY NOT NULL,
        "kind" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activities_createdAt ON activities ("createdAt");

      CREATE TABLE IF NOT EXISTS "appUsers" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "username" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "createdAt" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_appUsers_username ON "appUsers" ("username");

      CREATE TABLE IF NOT EXISTS "storeSettings" (
        "key" TEXT PRIMARY KEY NOT NULL,
        "value" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      );
    `);
    schemaInitialized = true;
  } catch (err) {
    console.error("Schema initialization failed", err);
  }
}

// ---------------------------------------------------------------------------
// Owner email (from process.env instead of Cloudflare env)
// ---------------------------------------------------------------------------

export function getOwnerEmail() {
  return process.env.JSTORE_OWNER_EMAIL?.trim().toLowerCase() || "owner@jstoredigital.com";
}
