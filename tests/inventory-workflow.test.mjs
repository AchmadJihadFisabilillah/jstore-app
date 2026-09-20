import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd(), tmp=mkdtempSync(join(tmpdir(),'jstore-workflow-'));

// Build test bundles — stub out @/db with a test-local SQLite wrapper
// that provides the same interface as the production PostgreSQL wrapper
await build({entryPoints:{route:join(root,'app/api/inventory/route.ts'),stockRoute:join(root,'app/api/stock/route.ts'),inventory:join(root,'lib/inventory.ts'),parser:join(root,'lib/stock-parser.ts'),productParser:join(root,'lib/product-parser.ts'),clientRequest:join(root,'lib/client-request.ts'),waTemplate:join(root,'lib/whatsapp-template.ts')},outdir:tmp,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',plugins:[{name:'test-pg-binding',setup(b){b.onResolve({filter:/^@\/db$/},()=>({path:'pgcompat',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
export const getInventoryDb = () => globalThis.__jstoreTestDb;
export const getOwnerEmail = () => globalThis.__jstoreOwnerEmail;
export const ensureDbSchema = async () => {};
`}));}}]});

const {GET,POST}=await import(pathToFileURL(join(tmp,'route.mjs')).href);
const {GET:stockGET}=await import(pathToFileURL(join(tmp,'stockRoute.mjs')).href);
const {summarizeSales}=await import(pathToFileURL(join(tmp,'inventory.mjs')).href);
const {parseStockInput}=await import(pathToFileURL(join(tmp,'parser.mjs')).href);
const {parseProductBulkInput}=await import(pathToFileURL(join(tmp,'productParser.mjs')).href);
const {requestJSON,isDefinitiveRejection}=await import(pathToFileURL(join(tmp,'clientRequest.mjs')).href);
const {formatWhatsAppMessage,DEFAULT_WA_TEMPLATE}=await import(pathToFileURL(join(tmp,'waTemplate.mjs')).href);

let sqlite;

/**
 * Create a SQLite-backed test DB that implements the same interface
 * as the production PostgreSQL CompatDb wrapper.
 *
 * The route files use $1, $2, ... PostgreSQL-style placeholders.
 * We convert those back to ? for SQLite execution.
 */
function createTestDb(db) {
  function pgToSqlite(sql) {
    // Convert $N placeholders back to ? for SQLite
    let converted = sql.replace(/\$\d+/g, '?');
    // Convert ON CONFLICT DO NOTHING back to INSERT OR IGNORE
    // We need a smarter approach: detect INSERT...ON CONFLICT DO NOTHING and convert
    converted = converted.replace(/INSERT\s+INTO\s+(.*?)\s+VALUES\s*\((.*?)\)\s+ON\s+CONFLICT\s+DO\s+NOTHING/gis, 
      (match, table, values) => `INSERT OR IGNORE INTO ${table} VALUES (${values})`);
    // Remove double quotes around identifiers (SQLite doesn't need them for camelCase)
    converted = converted.replace(/"(\w+)"/g, '$1');
    return converted;
  }

  function prepare(sql) {
    const sqliteSql = pgToSqlite(sql);
    return {
      sql,
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return db.prepare(sqliteSql).get(...this.params) || null;
      },
      async all() {
        return { results: db.prepare(sqliteSql).all(...this.params) };
      },
      async run() {
        const results = db.prepare(sqliteSql).all(...this.params);
        const changes = db.prepare('SELECT changes() as n').get().n;
        return { results, meta: { changes: Number(changes) } };
      },
    };
  }

  return {
    prepare,
    async batch(queries) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = queries.map(q => {
          const sqliteSql = pgToSqlite(q.sql);
          const results = db.prepare(sqliteSql).all(...q.params);
          const changes = db.prepare('SELECT changes() as n').get().n;
          return { results, meta: { changes: Number(changes) } };
        });
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

// SQLite migration SQL (equivalent to the PostgreSQL migration but in SQLite syntax)
const sqliteMigration = `
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  type text NOT NULL,
  duration text NOT NULL,
  price integer NOT NULL,
  cost integer NOT NULL,
  minStock integer DEFAULT 10 NOT NULL,
  createdAt text NOT NULL,
  resellerPrice integer,
  warrantyHours integer DEFAULT 0 NOT NULL,
  waTemplate text
);
CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY NOT NULL,
  productId text NOT NULL,
  productName text NOT NULL,
  quantity integer NOT NULL,
  total integer NOT NULL,
  cost integer NOT NULL,
  customer text NOT NULL,
  createdAt text NOT NULL,
  kind text DEFAULT 'sale' NOT NULL,
  actorId text DEFAULT '' NOT NULL,
  actorName text DEFAULT '' NOT NULL,
  reference text DEFAULT '' NOT NULL,
  requestFingerprint text DEFAULT '' NOT NULL,
  originalSaleId text,
  warrantyUntil text,
  FOREIGN KEY (productId) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_createdAt ON sales (createdAt);
CREATE INDEX IF NOT EXISTS idx_sales_originalSaleId ON sales (originalSaleId);
CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY NOT NULL,
  productId text NOT NULL,
  value text NOT NULL,
  cost integer NOT NULL,
  expiresAt text,
  state text DEFAULT 'ready' NOT NULL,
  saleId text,
  batchId text NOT NULL,
  createdAt text NOT NULL,
  FOREIGN KEY (productId) REFERENCES products(id),
  FOREIGN KEY (saleId) REFERENCES sales(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_product_value ON stocks (productId, value);
CREATE INDEX IF NOT EXISTS idx_stocks_product_state ON stocks (productId, state);
CREATE INDEX IF NOT EXISTS idx_stocks_saleId ON stocks (saleId);
CREATE TABLE IF NOT EXISTS warrantyClaims (
  id text PRIMARY KEY NOT NULL,
  originalSaleId text NOT NULL,
  originalStockId text NOT NULL,
  replacementStockId text NOT NULL,
  replacementSaleId text NOT NULL,
  reason text NOT NULL,
  override integer DEFAULT 0 NOT NULL,
  createdAt text NOT NULL,
  FOREIGN KEY (originalSaleId) REFERENCES sales(id),
  FOREIGN KEY (originalStockId) REFERENCES stocks(id),
  FOREIGN KEY (replacementStockId) REFERENCES stocks(id),
  FOREIGN KEY (replacementSaleId) REFERENCES sales(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_originalStockId ON warrantyClaims (originalStockId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_replacementStockId ON warrantyClaims (replacementStockId);
CREATE INDEX IF NOT EXISTS idx_claims_originalSaleId ON warrantyClaims (originalSaleId);
CREATE TABLE IF NOT EXISTS activities (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL,
  message text NOT NULL,
  quantity integer DEFAULT 0 NOT NULL,
  createdAt text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_createdAt ON activities (createdAt);
CREATE TABLE IF NOT EXISTS appUsers (
  id text PRIMARY KEY NOT NULL,
  username text NOT NULL,
  name text NOT NULL,
  password text NOT NULL,
  role text DEFAULT 'admin' NOT NULL,
  createdAt text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appUsers_username ON appUsers (username);
CREATE TABLE IF NOT EXISTS storeSettings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL,
  updatedAt text NOT NULL
);
`;

beforeEach(() => {
  globalThis.__jstoreOwnerEmail = 'owner@example.com';
  sqlite?.close();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  // Apply SQLite-compatible migration
  for (const stmt of sqliteMigration.split(';').map(s => s.trim()).filter(Boolean)) {
    sqlite.exec(stmt);
  }
  globalThis.__jstoreTestDb = createTestDb(sqlite);
});

after(() => { sqlite?.close(); rmSync(tmp, { recursive: true, force: true }); });

// Use cookie-based auth for tests
async function createTestSession(user) {
  // Import auth module to create real session tokens
  const authBundle = join(tmp, 'auth.mjs');
  try {
    // Build auth module if not already built
    await build({entryPoints:{auth:join(root,'lib/auth.ts')},outdir:tmp,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',allowOverwrite:true});
  } catch {}
  const {createSessionToken} = await import(pathToFileURL(authBundle).href);
  const token = await createSessionToken(user);
  return { cookie: `jstore_session=${token}` };
}

// For test simplicity, we'll use the oai headers approach since the test stub
// for operatorFromRequest in route files still goes through the production code.
// Actually, the route files import operatorFromRequest from @/lib/operator which
// uses cookie-based auth. Let's create proper session cookies.

let ownerCookie, adminCookie;

// We need to get cookies before tests run. Since beforeEach resets db,
// we create cookies once (they don't depend on db state).
const ownerUser = { id: 'owner-id', name: 'Owner', role: 'owner' };
const adminUser = { id: 'admin-id', name: 'Admin', role: 'admin' };

// Build auth for cookie creation
await build({entryPoints:{auth:join(root,'lib/auth.ts')},outdir:tmp,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',allowOverwrite:true});
const authMod = await import(pathToFileURL(join(tmp,'auth.mjs')).href);
const ownerToken = await authMod.createSessionToken(ownerUser);
const adminToken = await authMod.createSessionToken(adminUser);
ownerCookie = `jstore_session=${ownerToken}`;
adminCookie = `jstore_session=${adminToken}`;

const ownerHeaders = { cookie: ownerCookie };
const adminHeaders = { cookie: adminCookie };

async function call(body, headers = { 'x-jstore-request': '1', ...ownerHeaders }) {
  const r = await POST(new Request('https://jstore.test/api/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }));
  return { status: r.status, body: await r.json() };
}

async function product() {
  const r = await call({ action: 'product', name: 'CapCut', duration: '7 hari', category: 'Editing & Desain', type: 'account', price: 2000, cost: 1000, minStock: 3 });
  assert.equal(r.status, 200);
  return r.body.id;
}

async function stock(pid, lines, expiresAt = null, cost = 1000) {
  return call({ action: 'restock', productId: pid, lines, cost, expiresAt });
}

function sell(pid, quantity, id = crypto.randomUUID()) {
  return call({ action: 'sale', id, productId: pid, quantity, price: 2000, customer: 'Pelanggan uji' });
}

async function state(headers = ownerHeaders) {
  return (await GET(new Request('https://jstore.test/api/inventory', { headers }))).json();
}

test('duplicate imports are skipped without disclosing credentials in dashboard responses', async () => {
  const p = await product();
  const a = await stock(p, ['a@example.com|secret', 'a@example.com|secret', 'b@example.com|secret']);
  assert.deepEqual(a.body, { inserted: 2, duplicates: 1 });
  const b = await stock(p, ['a@example.com|secret', 'c@example.com|secret']);
  assert.deepEqual(b.body, { inserted: 1, duplicates: 1 });
  const d = await state();
  assert.equal(d.stocks.length, 3);
  assert.ok(d.stocks.every(s => !('value' in s)));
  assert.deepEqual(d.activities.filter(a => a.kind === 'restock').map(a => a.quantity).sort(), [1, 2]);
});

test('sale uses earliest expiry and actual stock cost, and replay is idempotent', async () => {
  const p = await product();
  await stock(p, ['no-expiry'], null, 1000);
  await stock(p, ['expires-first'], '2099-01-01', 1300);
  await stock(p, ['expires-later'], '2099-02-01', 1200);
  const sid = crypto.randomUUID();
  assert.equal((await sell(p, 2, sid)).status, 200);
  assert.equal((await sell(p, 2, sid)).status, 200);
  const d = await state();
  assert.equal(d.sales.length, 1);
  assert.equal(d.sales[0].cost, 2500);
  assert.equal(d.sales[0].total, 4000);
  assert.equal(d.stocks.filter(s => s.state === 'sold').length, 2);
  assert.equal(d.activities.filter(a => a.kind === 'sale').length, 1);
  assert.deepEqual(sqlite.prepare("SELECT value FROM stocks WHERE state='sold' ORDER BY value").all().map(s => s.value), ['expires-first', 'expires-later']);
});

test('concurrent sales cannot allocate the same stock, insufficient sale leaves no record', async () => {
  const p = await product();
  await stock(p, ['a', 'b', 'c']);
  const results = await Promise.all([sell(p, 2), sell(p, 2)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const d = await state();
  assert.equal(d.sales.length, 1);
  assert.equal(d.stocks.filter(s => s.state === 'sold').length, 2);
  assert.equal(d.activities.filter(a => a.kind === 'sale').length, 1);
});

test('expired or invalid stock is not sold; sold stock cannot be reactivated or product deleted', async () => {
  const p = await product();
  await stock(p, ['expired', 'invalid', 'ready']);
  sqlite.prepare("UPDATE stocks SET expiresAt='2000-01-01' WHERE value='expired'").run();
  const invalid = sqlite.prepare("SELECT id FROM stocks WHERE value='invalid'").get().id;
  assert.equal((await call({ action: 'stockState', id: invalid, state: 'invalid' })).status, 200);
  assert.equal((await sell(p, 2)).status, 409);
  assert.equal((await sell(p, 1)).status, 200);
  const sold = sqlite.prepare("SELECT id FROM stocks WHERE state='sold'").get().id;
  assert.equal((await call({ action: 'stockState', id: sold, state: 'ready' })).status, 409);
  assert.equal((await call({ action: 'deleteProduct', id: p })).status, 409);
  assert.equal((await state()).products.length, 1);
});

test('invalid inputs and cross-site requests are rejected', async () => {
  const p = await product();
  assert.equal((await stock(p, ['a'], '2020-02-31')).status, 400);
  assert.equal((await stock(p, ['a'], '2000-01-01')).status, 400);
  assert.equal((await call({ action: 'sale', id: 'x', productId: p, quantity: 0, price: 2000, customer: '' })).status, 400);
  assert.equal((await call({ action: 'deleteProduct', id: p }, {})).status, 403);
  assert.equal((await call({ action: 'deleteProduct', id: p }, { 'x-jstore-request': '1', 'sec-fetch-site': 'cross-site' })).status, 403);
});

async function stockDetails(query, headers = ownerHeaders) {
  const r = await stockGET(new Request(`https://jstore.test/api/stock?${query}`, { headers }));
  return { status: r.status, body: await r.json() };
}

async function configuredProduct(hours = 24) {
  const p = await product();
  sqlite.prepare('UPDATE products SET resellerPrice=1700,warrantyHours=? WHERE id=?').run(hours, p);
  return p;
}

function take(p, extra = {}, headers = ownerHeaders) {
  return call({ action: 'sale', id: crypto.randomUUID(), productId: p, quantity: 1, ...extra }, { 'x-jstore-request': '1', ...headers });
}

function replace(p, root, source, extra = {}, headers = adminHeaders) {
  return take(p, { kind: 'replacement', originalSaleId: root, sourceStockIds: [source], reference: 'Premium tidak aktif', ...extra }, headers);
}

test('admins can fulfil and restock while finance and owner-only writes remain protected', async () => {
  const p = await configuredProduct();
  await stock(p, ['secret-account|password']);
  const staffStock = await call({ action: 'restock', productId: p, lines: ['admin-stock|sandi'], expiresAt: null }, { 'x-jstore-request': '1', ...adminHeaders });
  assert.equal(staffStock.status, 200);
  assert.equal(sqlite.prepare("SELECT cost FROM stocks WHERE value='admin-stock|sandi'").get().cost, 1000);
  const metadata = await state(adminHeaders);
  assert.equal(metadata.viewer.role, 'admin');
  assert.ok(metadata.products.every(p => !('cost' in p)));
  assert.ok(metadata.stocks.every(s => !('cost' in s) && !('value' in s)));
  const hidden = await stockDetails(`product=${p}`, adminHeaders);
  assert.equal(hidden.status, 200);
  assert.ok(hidden.body.stocks.every(s => !('value' in s) && !('cost' in s)));
  const sold = await take(p, { priceTier: 'reseller', expectedPrice: 1700 }, adminHeaders);
  assert.equal(sold.status, 200);
  assert.equal(sold.body.receipt.sale.total, 1700);
  assert.equal(sold.body.receipt.sale.actorId, 'admin-id');
  assert.ok(!('cost' in sold.body.receipt.sale));
  assert.ok(sold.body.receipt.stocks.every(s => s.value && !('cost' in s)));
  const history = await state(adminHeaders);
  assert.ok(history.sales.every(s => !('cost' in s) && !('requestFingerprint' in s)));
  const detail = await stockDetails(`sale=${sold.body.id}`, adminHeaders);
  assert.ok(detail.body.stocks[0].value);
  assert.ok(!('cost' in detail.body.stocks[0]));
  assert.equal((await take(p, { price: 1 }, adminHeaders)).status, 403);
  assert.equal((await call({ action: 'deleteProduct', id: p }, { 'x-jstore-request': '1', ...adminHeaders })).status, 403);
  assert.equal((await call({ action: 'restock', productId: p, lines: ['x'], cost: 0, expiresAt: null }, { 'x-jstore-request': '1', ...adminHeaders })).status, 403);
  assert.equal((await call({ action: 'product', id: p, name: 'Changed', duration: '7 hari', category: 'Editing & Desain', type: 'account', price: 1, cost: 0, minStock: 0 }, { 'x-jstore-request': '1', ...adminHeaders })).status, 403);
  assert.ok((await state()).sales[0].cost > 0);
});

test('authentication is required', async () => {
  assert.equal((await GET(new Request('https://jstore.test/api/inventory'))).status, 401);
  assert.equal((await stockDetails('product=unknown', {})).status, 401);
  assert.equal((await call({ action: 'deleteProduct', id: 'x' }, { 'x-jstore-request': '1' })).status, 401);
});

test('server prices and captured actual costs are authoritative; changed prices require review', async () => {
  const p = await configuredProduct();
  await stock(p, ['a', 'b', 'c'], null, 900);
  assert.equal((await take(p, { expectedPrice: 1900 })).status, 409);
  assert.equal((await state()).sales.length, 0);
  const normal = await take(p);
  assert.equal(normal.body.receipt.sale.total, 2000);
  const reseller = await take(p, { priceTier: 'reseller' }, adminHeaders);
  assert.equal(reseller.body.receipt.sale.total, 1700);
  const custom = await take(p, { price: 1500 });
  assert.equal(custom.body.receipt.sale.total, 1500);
  sqlite.prepare('UPDATE products SET price=9999,cost=9999').run();
  const summary = summarizeSales((await state()).sales);
  assert.equal(summary.omzet, 5200);
  assert.equal(summary.cost, 2700);
  assert.equal(summary.grossProfit, 2500);
});

test('replaying one request returns identical accounts and rejects changed content or operator', async () => {
  const p = await configuredProduct();
  await stock(p, ['first', 'second', 'third']);
  const id = crypto.randomUUID();
  const [a, b] = await Promise.all([take(p, { id }), take(p, { id })]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(a.body.receipt, b.body.receipt);
  assert.equal((await take(p, { id, quantity: 2 })).status, 409);
  assert.equal((await take(p, { id }, adminHeaders)).status, 409);
  assert.equal((await state()).sales.length, 1);
  assert.equal((await state()).stocks.filter(s => s.saleId).length, 1);
});

test('30 simultaneous admin requests allocate unique accounts and keep totals exact', async () => {
  const p = await configuredProduct();
  await stock(p, Array.from({ length: 20 }, (_, i) => `account-${i}|sandi`), null, 1100);
  // All admin requests use same cookie but different sale IDs
  const results = await Promise.all(Array.from({ length: 30 }, () => take(p, {}, adminHeaders)));
  assert.equal(results.filter(r => r.status === 200).length, 20);
  assert.equal(results.filter(r => r.status === 409).length, 10);
  const allocated = results.filter(r => r.status === 200).map(r => r.body.receipt.stocks[0].id);
  assert.equal(new Set(allocated).size, 20);
  const d = await state();
  assert.equal(d.sales.length, 20);
  assert.equal(summarizeSales(d.sales).omzet, 40000);
  assert.equal(summarizeSales(d.sales).grossProfit, 18000);
});

test('warranty replacement links original account, preserves deadline, and records cost without new revenue', async () => {
  const p = await configuredProduct();
  await stock(p, ['original'], null, 900);
  const sale = await take(p, { customer: 'Buyer', reference: 'WA-001' });
  const originalStock = sale.body.receipt.stocks[0];
  await stock(p, ['replacement'], null, 1200);
  const id = crypto.randomUUID();
  const replacement = await replace(p, sale.body.id, originalStock.id, { id });
  assert.equal(replacement.status, 200);
  const rec = replacement.body.receipt;
  assert.equal(rec.sale.total, 0);
  assert.equal(rec.sale.customer, 'Buyer');
  assert.equal(rec.sale.originalSaleId, sale.body.id);
  assert.equal(rec.sale.warrantyUntil, sale.body.receipt.sale.warrantyUntil);
  assert.equal(rec.stocks[0].state, 'replaced');
  assert.equal((await replace(p, sale.body.id, originalStock.id, { id })).status, 200);
  const d = await state();
  assert.equal(d.claims.length, 1);
  assert.equal(d.claims[0].originalStockId, originalStock.id);
  assert.equal(d.claims[0].replacementStockId, rec.stocks[0].id);
  const summary = summarizeSales(d.sales);
  assert.equal(summary.omzet, 2000);
  assert.equal(summary.grossProfit, 1100);
  assert.equal(summary.replacementCost, 1200);
  assert.equal(summary.afterReplacement, -100);
  assert.equal(summary.quantity, 1);
  assert.equal((await call({ action: 'stockState', id: rec.stocks[0].id, state: 'ready' })).status, 409);
  const active = await stockDetails(`sale=${sale.body.id}&activeWarranty=1`, adminHeaders);
  assert.deepEqual(active.body.stocks.map(s => s.id), [rec.stocks[0].id]);
  await stock(p, ['second-replacement'], null, 1000);
  const again = await replace(p, sale.body.id, rec.stocks[0].id);
  assert.equal(again.status, 200);
  assert.equal(again.body.receipt.sale.warrantyUntil, rec.sale.warrantyUntil);
  assert.equal((await replace(p, sale.body.id, originalStock.id)).status, 409);
});

test('racing claims for the same account create only one replacement and one claim', async () => {
  const p = await configuredProduct();
  await stock(p, ['original']);
  const sale = await take(p);
  await stock(p, ['next-a', 'next-b']);
  const results = await Promise.all([replace(p, sale.body.id, sale.body.receipt.stocks[0].id), replace(p, sale.body.id, sale.body.receipt.stocks[0].id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const d = await state();
  assert.equal(d.claims.length, 1);
  assert.equal(d.sales.filter(s => s.kind === 'replacement').length, 1);
  assert.equal(d.stocks.filter(s => s.state === 'ready').length, 1);
});

test('warranty validates ownership, expiry, quantity, and explicit owner exceptions', async () => {
  const p = await configuredProduct(0);
  await stock(p, ['first', 'second', 'third']);
  const original = await take(p);
  const source = original.body.receipt.stocks[0].id;
  assert.equal((await replace(p, original.body.id, source)).status, 409);
  assert.equal((await replace(p, original.body.id, source, { allowExpired: 1 })).status, 403);
  const other = await take(p);
  assert.equal((await replace(p, other.body.id, source, {}, ownerHeaders)).status, 409);
  const override = await replace(p, original.body.id, source, { allowExpired: 1 }, ownerHeaders);
  assert.equal(override.status, 200);
  assert.equal((await state()).claims[0].override, 1);
  const q = await configuredProduct();
  await stock(q, ['another']);
  const wrong = await replace(q, original.body.id, source);
  assert.equal(wrong.status, 400);
  sqlite.prepare("UPDATE sales SET warrantyUntil='2000-01-01T00:00:00.000Z' WHERE id=?").run(other.body.id);
  assert.equal((await replace(p, other.body.id, other.body.receipt.stocks[0].id)).status, 409);
});

test('supplier parser handles bulk messages without corrupting passwords or losing unknown lines', () => {
  const parsed = parseStockInput('ORDER ID: SUP-001\n1. a@example.com|p@ss|word\n📧 **Email:** [b@example.com](mailto:b@example.com)\n🔑 **Password:** se**cret|x\n2. a@example.com|p@ss|word\ncatatan tidak dikenal\nEmail: orphan@example.com', 'account');
  assert.deepEqual(parsed.values, ['a@example.com|p@ss|word', 'b@example.com|se**cret|x']);
  assert.equal(parsed.duplicates, 1);
  assert.equal(parsed.ignored.length, 1);
  assert.equal(parsed.issues.length, 2);
  assert.equal(parsed.issues[1].line, 7);
  const links = parseStockInput('ITEM: Link aktivasi\n1. https://example.com/a?token=a%2Bb\n[Link](https://example.com/b)\njavascript:alert(1)', 'link');
  assert.deepEqual(links.values, ['https://example.com/a?token=a%2Bb', 'https://example.com/b']);
  assert.equal(links.issues.length, 1);
  const orphan = parseStockInput('Email: a@example.com\nEmail: b@example.com\nPassword: secret', 'account');
  assert.equal(orphan.issues.length, 1);
  assert.deepEqual(orphan.values, ['b@example.com|secret']);
});

test('25-account warranty batches stay atomic', async () => {
  const p = await configuredProduct();
  await stock(p, Array.from({ length: 50 }, (_, i) => `batch-${i}|pw`));
  const sale = await take(p, { quantity: 25 });
  const ids = sale.body.receipt.stocks.map(s => s.id);
  const replaced = await take(p, { quantity: 25, kind: 'replacement', originalSaleId: sale.body.id, sourceStockIds: ids, reference: '25 akun tidak aktif' }, adminHeaders);
  assert.equal(replaced.status, 200);
  const d = await state();
  assert.equal(d.claims.length, 25);
  assert.equal(d.stocks.filter(s => s.state === 'replaced').length, 25);
  assert.equal(summarizeSales(d.sales).omzet, 50000);
  assert.equal(summarizeSales(d.sales).replacementCost, 25000);
});

test('supplier Telegram labels, escaped mailto links, and flattened records retain correct pairs', () => {
  const labeled = parseStockInput('〔 *PRODUCT DETAIL* 〕\n1. Email: [alpha@example.com](mailto\\:alpha@example.com)\n- Password: p@ss**|word\n2. Email/User : beta\\@example.com\nPassword : abc_123', 'account');
  assert.deepEqual(labeled.values, ['alpha@example.com|p@ss**|word', 'beta@example.com|abc_123']);
  assert.equal(labeled.issues.length, 0);
  const flat = parseStockInput('✅ Success - order delivered  [👤](https://web.telegram.org/k/assets/img/emoji/1f464.png) Account 1 [📧](https://web.telegram.org/k/assets/img/emoji/1f4e7.png) Email/User : one\\@example.com [🔑](https://web.telegram.org/k/assets/img/emoji/1f511.png) Password : secret1  [👤](https://web.telegram.org/k/assets/img/emoji/1f464.png) Account 2 [📧](https://web.telegram.org/k/assets/img/emoji/1f4e7.png) Email/User : two\\@example.com [🔑](https://web.telegram.org/k/assets/img/emoji/1f511.png) Password : secret2', 'account');
  assert.deepEqual(flat.values, ['one@example.com|secret1', 'two@example.com|secret2']);
  assert.equal(flat.issues.length, 0);
});

test('partial supplier labels cannot consume a later account or become a saleable credential', () => {
  const p = parseStockInput('Email: broken@example.com\nPassword:\nEmail: good@example.com\nPassword: valid\nEmail: words that are not an account\nPassword: secret', 'account');
  assert.deepEqual(p.values, ['good@example.com|valid']);
  assert.ok(p.issues.length >= 2);
});

test('stalled requests abort and ambiguous gateway failures preserve recovery eligibility', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    await assert.rejects(() => requestJSON('https://jstore.test/api/inventory', {}, 15), /Koneksi terlalu lama/);
    globalThis.fetch = async () => new Response('<html>Timeout</html>', { status: 408 });
    const timeout = await requestJSON('https://jstore.test/api/inventory');
    assert.equal(timeout.ok, false);
    assert.equal(isDefinitiveRejection(timeout.status), false);
    assert.equal(isDefinitiveRejection(429), false);
    assert.equal(isDefinitiveRejection(503), false);
    assert.equal(isDefinitiveRejection(409), true);
    globalThis.fetch = async () => Response.json({ id: 'same-transaction', receipt: { sale: { id: 'same-transaction' } } });
    const response = await requestJSON('https://jstore.test/api/inventory');
    assert.equal(response.body.id, 'same-transaction');
  } finally { globalThis.fetch = originalFetch; }
});

test('bulk product CSV parser and import API works atomically and protects permissions', async () => {
  const csv = `Nama Produk,Kategori,Varian,Jenis,Harga Jual,Modal,Reseller,Garansi,Min
Canva Pro Edu,Editing & Desain,Lifetime,link,15000,5000,12000,0,10
Netflix 4K UHD,Streaming,1 Bulan,account,28000,19000,25000,48,5
Invalid Line
Spotify Individual,Musik,3 Bulan,account,18000,10000,15000,72,8`;
  const parsed = parseProductBulkInput(csv);
  assert.equal(parsed.valid.length, 3);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.valid[0].name, 'Canva Pro Edu');
  assert.equal(parsed.valid[0].price, 15000);
  assert.equal(parsed.valid[0].cost, 5000);
  assert.equal(parsed.valid[1].warrantyHours, 48);

  const adminRes = await call({ action: 'bulkProducts', products: parsed.valid }, { 'x-jstore-request': '1', ...adminHeaders });
  assert.equal(adminRes.status, 403);

  const ownerRes = await call({ action: 'bulkProducts', products: parsed.valid }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(ownerRes.status, 200);
  assert.equal(ownerRes.body.inserted, 3);

  const d = await state();
  assert.equal(d.products.length, 3);
  assert.ok(d.activities.some(a => a.message.includes('Impor massal: 3 produk baru')));

  const productIds = d.products.map(p => p.id);
  const adminDelRes = await call({ action: 'bulkDeleteProducts', ids: productIds }, { 'x-jstore-request': '1', ...adminHeaders });
  assert.equal(adminDelRes.status, 403);

  const ownerDelRes = await call({ action: 'bulkDeleteProducts', ids: productIds, deleteStocks: true }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(ownerDelRes.status, 200);
  assert.equal(ownerDelRes.body.deleted, 3);

  const afterDelete = await state();
  assert.equal(afterDelete.products.length, 0);
  assert.ok(afterDelete.activities.some(a => a.message.includes('Hapus massal: 3 produk')));
});

test('delete single sale and clear all sales history with stock restore options', async () => {
  const p = await product();
  await stock(p, ['acc1@test.com|pass1', 'acc2@test.com|pass2', 'acc3@test.com|pass3']);

  const sale1 = await sell(p, 1, 'sale-del-1');
  const sale2 = await sell(p, 1, 'sale-del-2');
  assert.equal(sale1.status, 200);
  assert.equal(sale2.status, 200);

  let st = await state();
  assert.equal(st.sales.length, 2);
  assert.equal(st.stocks.filter(s => s.state === 'ready').length, 1);
  assert.equal(st.stocks.filter(s => s.state === 'sold').length, 2);

  const adminDel = await call({ action: 'deleteSale', id: 'sale-del-1', restoreStock: true }, { 'x-jstore-request': '1', ...adminHeaders });
  assert.equal(adminDel.status, 403);

  const ownerDel1 = await call({ action: 'deleteSale', id: 'sale-del-1', restoreStock: true }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(ownerDel1.status, 200);
  assert.equal(ownerDel1.body.deleted, 1);

  st = await state();
  assert.equal(st.sales.length, 1);
  assert.equal(st.sales[0].id, 'sale-del-2');
  assert.equal(st.stocks.filter(s => s.state === 'ready').length, 2);

  const clearRes = await call({ action: 'clearSalesHistory', restoreStock: false }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(clearRes.status, 200);

  st = await state();
  assert.equal(st.sales.length, 0);
  assert.equal(st.stocks.filter(s => s.state === 'ready').length, 2);
});

test('whatsapp template formatting, product-specific templates, and store default settings', async () => {
  // Test format engine
  const formatted = formatWhatsAppMessage(
    'Halo {customer}! Pesanan {product} ({credentials}) total {total}',
    { customer: 'Andi', productName: 'Canva Pro Edu', credentials: 'user@mail.com|pass', total: 15000 }
  );
  assert.ok(formatted.includes('Halo Andi! Pesanan Canva Pro Edu (user@mail.com|pass) total'));
  assert.ok(formatted.includes('15.000'));

  // Test fallback to default
  const defaultFormatted = formatWhatsAppMessage(
    null,
    { customer: 'Budi', productName: 'Netflix UHD', credentials: 'netflix@mail.com|secret' }
  );
  assert.ok(defaultFormatted.includes('Halo kak Budi, terima kasih sudah order di JStore Digital!'));
  assert.ok(defaultFormatted.includes('Netflix UHD'));

  // Test product creation with custom waTemplate
  const pRes = await call({
    action: 'product',
    name: 'Spotify Premium Family',
    category: 'Musik',
    type: 'account',
    duration: '3 Bulan',
    price: 35000,
    cost: 20000,
    minStock: 5,
    waTemplate: 'Hi {customer}, ini link invite Spotify kamu: {credentials}\nGaransi: {warranty}'
  }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(pRes.status, 200);

  const st = await state();
  const createdP = st.products.find(p => p.id === pRes.body.id);
  assert.ok(createdP);
  assert.equal(createdP.waTemplate, 'Hi {customer}, ini link invite Spotify kamu: {credentials}\nGaransi: {warranty}');

  // Test update store settings (default template)
  const setResAdmin = await call({
    action: 'updateSettings',
    key: 'defaultWaTemplate',
    value: 'Halo kak {customer}, produk {product} siap digunakan:\n{credentials}'
  }, { 'x-jstore-request': '1', ...adminHeaders });
  assert.equal(setResAdmin.status, 403);

  const setResOwner = await call({
    action: 'updateSettings',
    key: 'defaultWaTemplate',
    value: 'Halo kak {customer}, produk {product} siap digunakan:\n{credentials}'
  }, { 'x-jstore-request': '1', ...ownerHeaders });
  assert.equal(setResOwner.status, 200);

  const stAfter = await state();
  assert.equal(stAfter.defaultWaTemplate, 'Halo kak {customer}, produk {product} siap digunakan:\n{credentials}');
});

