import { integer, pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull(),
  duration: text("duration").notNull(),
  price: integer("price").notNull(),
  cost: integer("cost").notNull(),
  minStock: integer("minStock").notNull().default(10),
  createdAt: text("createdAt").notNull(),
  resellerPrice: integer("resellerPrice"),
  warrantyHours: integer("warrantyHours").notNull().default(0),
  waTemplate: text("waTemplate"),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  productId: text("productId").notNull(),
  productName: text("productName").notNull(),
  quantity: integer("quantity").notNull(),
  total: integer("total").notNull(),
  cost: integer("cost").notNull(),
  customer: text("customer").notNull(),
  createdAt: text("createdAt").notNull(),
  kind: text("kind").notNull().default("sale"),
  actorId: text("actorId").notNull().default(""),
  actorName: text("actorName").notNull().default(""),
  reference: text("reference").notNull().default(""),
  requestFingerprint: text("requestFingerprint").notNull().default(""),
  originalSaleId: text("originalSaleId"),
  warrantyUntil: text("warrantyUntil"),
}, (table) => [
  index("idx_sales_createdAt").on(table.createdAt),
  index("idx_sales_originalSaleId").on(table.originalSaleId),
]);

export const stocks = pgTable("stocks", {
  id: text("id").primaryKey(),
  productId: text("productId").notNull(),
  value: text("value").notNull(),
  cost: integer("cost").notNull(),
  expiresAt: text("expiresAt"),
  state: text("state").notNull().default("ready"),
  saleId: text("saleId").references(() => sales.id),
  batchId: text("batchId").notNull(),
  createdAt: text("createdAt").notNull(),
}, (table) => [
  uniqueIndex("idx_stocks_product_value").on(table.productId, table.value),
  index("idx_stocks_product_state").on(table.productId, table.state),
  index("idx_stocks_saleId").on(table.saleId),
]);

export const warrantyClaims = pgTable("warrantyClaims", {
  id: text("id").primaryKey(),
  originalSaleId: text("originalSaleId").notNull().references(() => sales.id),
  originalStockId: text("originalStockId").notNull().references(() => stocks.id),
  replacementStockId: text("replacementStockId").notNull().references(() => stocks.id),
  replacementSaleId: text("replacementSaleId").notNull().references(() => sales.id),
  reason: text("reason").notNull(),
  override: integer("override").notNull().default(0),
  createdAt: text("createdAt").notNull(),
}, (table) => [
  uniqueIndex("idx_claims_originalStockId").on(table.originalStockId),
  uniqueIndex("idx_claims_replacementStockId").on(table.replacementStockId),
  index("idx_claims_originalSaleId").on(table.originalSaleId),
]);

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  quantity: integer("quantity").notNull().default(0),
  createdAt: text("createdAt").notNull(),
}, (table) => [
  index("idx_activities_createdAt").on(table.createdAt),
]);

export const appUsers = pgTable("appUsers", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: text("createdAt").notNull(),
}, (table) => [
  uniqueIndex("idx_appUsers_username").on(table.username),
]);

export const storeSettings = pgTable("storeSettings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

