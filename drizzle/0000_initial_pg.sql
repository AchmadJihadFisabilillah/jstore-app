-- JStore Digital: Initial PostgreSQL schema
-- Migrated from Cloudflare D1 (SQLite)

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
