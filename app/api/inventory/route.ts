import { z } from "zod";
import { getInventoryDb, ensureDbSchema, type CompatDb } from "@/db";
import { today, categories, type Product, type Sale, type Stock } from "@/lib/inventory";
import { operatorFromRequest, visibleRecord } from "@/lib/operator";

const amount=z.number().int().min(0).max(1000000000),id=z.string().min(1).max(100);
const productSchema=z.object({action:z.literal("product"),id:id.optional(),name:z.string().trim().min(1).max(100),category:z.enum(categories as [string,...string[]]),type:z.enum(["account","link","license","other"]),duration:z.string().trim().min(1).max(80),price:amount,cost:amount,minStock:z.number().int().min(0).max(100000),resellerPrice:amount.nullable().default(null),warrantyHours:z.number().int().min(0).max(87600).default(0),waTemplate:z.string().trim().max(3000).nullable().optional()});
const bulkProductsSchema=z.object({action:z.literal("bulkProducts"),products:z.array(z.object({name:z.string().trim().min(1).max(100),category:z.enum(categories as [string,...string[]]),type:z.enum(["account","link","license","other"]),duration:z.string().trim().min(1).max(80),price:amount,cost:amount,minStock:z.number().int().min(0).max(100000).default(10),resellerPrice:amount.nullable().default(null),warrantyHours:z.number().int().min(0).max(87600).default(0),initialStock:z.array(z.string().trim().min(1).max(3000)).optional(),waTemplate:z.string().trim().max(3000).nullable().optional()})).min(1).max(500)});
const bulkDeleteProductsSchema=z.object({action:z.literal("bulkDeleteProducts"),ids:z.array(id).min(1).max(500),deleteStocks:z.boolean().optional()});
const restockSchema=z.object({action:z.literal("restock"),productId:id,lines:z.array(z.string().trim().min(1).max(3000)).min(1).max(500),cost:amount.optional(),reference:z.string().trim().max(150).default(""),expiresAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s).nullable().optional()});
const saleSchema=z.object({action:z.literal("sale"),id,productId:id,quantity:z.number().int().min(1).max(10000),price:amount.optional(),expectedPrice:amount.optional(),priceTier:z.enum(["retail","reseller"]).default("retail"),customer:z.string().trim().max(150).default(""),kind:z.enum(["sale","replacement"]).default("sale"),reference:z.string().trim().max(150).default(""),originalSaleId:id.optional(),sourceStockIds:z.array(id).max(25).default([]),allowExpired:z.literal(1).optional()});
const deleteSaleSchema=z.object({action:z.literal("deleteSale"),id,restoreStock:z.boolean().default(false)});
const clearSalesHistorySchema=z.object({action:z.literal("clearSalesHistory"),restoreStock:z.boolean().default(false)});
const updateSettingsSchema=z.object({action:z.literal("updateSettings"),key:z.string().min(1).max(50),value:z.string().max(4000)});
const schema=z.discriminatedUnion("action",[productSchema,bulkProductsSchema,bulkDeleteProductsSchema,restockSchema,saleSchema,deleteSaleSchema,clearSalesHistorySchema,updateSettingsSchema,z.object({action:z.literal("deleteProduct"),id,deleteStocks:z.boolean().optional(),force:z.boolean().optional()}),z.object({action:z.literal("stockState"),id,state:z.enum(["ready","invalid"])})]);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const salesColumns='"id","productId","productName","quantity","total","cost","customer","createdAt","kind","actorId","actorName","reference","originalSaleId","warrantyUntil"';
const placeholders=(n:number,offset=0)=>Array.from({length:n},(_,i)=>`$${i+1+offset}`).join(",");
const placeholdersFrom=(start:number,n:number)=>Array.from({length:n},(_,i)=>`$${start+i}`).join(",");

export async function GET(request:Request) {
  try {
    const operator=await operatorFromRequest(request);
    if(!operator)return json({error:"Sesi masuk tidak ditemukan. Buka kembali website."},401);
    const db=getInventoryDb(), owner=operator.role==="owner";
    await ensureDbSchema(db);
    const p=await db.prepare('SELECT * FROM products ORDER BY "createdAt" ASC').all<Product>();
    const s=await db.prepare('SELECT "id","productId","cost","expiresAt","state","saleId","createdAt" FROM stocks ORDER BY "createdAt" DESC').all();
    const o=await db.prepare(`SELECT ${salesColumns} FROM sales ORDER BY "createdAt" DESC`).all();
    const a=await db.prepare('SELECT * FROM activities ORDER BY "createdAt" DESC LIMIT 200').all();
    const c=await db.prepare('SELECT * FROM "warrantyClaims" ORDER BY "createdAt" DESC').all();
    let defaultWaTemplate = "";
    try {
      const setting = await db.prepare('SELECT "value" FROM "storeSettings" WHERE "key"=$1').bind("defaultWaTemplate").first<{value:string}>();
      if(setting) defaultWaTemplate = setting.value;
    } catch {}
    return json({products:p.results.map(r=>visibleRecord(r,owner)),stocks:s.results.map(r=>visibleRecord(r as Record<string,unknown>,owner)),sales:o.results.map(r=>visibleRecord(r as Record<string,unknown>,owner)),activities:a.results,claims:c.results,viewer:operator,defaultWaTemplate});
  }catch(err){console.error("Inventory read unavailable:", err);return json({error:"Data toko belum dapat dimuat. Silakan coba lagi."},503);}
}

export async function POST(request:Request) {
  if(request.headers.get("x-jstore-request")!=="1"||request.headers.get("sec-fetch-site")==="cross-site")return json({error:"Permintaan tidak diizinkan."},403);
  if(Number(request.headers.get("content-length")||0)>2000000)return json({error:"Maksimal 500 baris per impor."},413);
  let operator:Awaited<ReturnType<typeof operatorFromRequest>>;
  try{operator=await operatorFromRequest(request);}catch{return json({error:"Pengaturan akses toko belum tersedia."},503);}
  if(!operator)return json({error:"Sesi masuk tidak ditemukan. Buka kembali website."},401);
  let raw:unknown;try{raw=await request.json();}catch{return json({error:"Format data tidak valid."},400);}
  const result=schema.safeParse(raw);
  if(!result.success)return json({error:"Periksa formulir: data wajib, nominal rupiah, dan batas jumlah stok."},400);
  const data=result.data,owner=operator.role==="owner";
  if(!owner && (data.action==="product"||data.action==="bulkProducts"||data.action==="deleteProduct"||data.action==="bulkDeleteProducts"||data.action==="deleteSale"||data.action==="clearSalesHistory"||data.action==="updateSettings"||(data.action==="restock"&&data.cost!==undefined)||(data.action==="sale"&&(data.price!==undefined||data.allowExpired))))return json({error:"Hanya owner yang dapat mengubah harga, modal, produk, pengaturan toko, menghapus riwayat, atau memberi pengecualian garansi."},403);
  const fingerprint=data.action==="sale"?JSON.stringify({productId:data.productId,quantity:data.quantity,price:data.price??null,priceTier:data.priceTier,customer:data.customer,kind:data.kind,reference:data.reference,originalSaleId:data.originalSaleId??null,sourceStockIds:[...data.sourceStockIds].sort(),allowExpired:data.allowExpired??null}):"";
  const receipt=async(saleId:string)=>{
    const db=getInventoryDb();
    const sale=await db.prepare(`SELECT ${salesColumns} FROM sales WHERE id=$1`).bind(saleId).first<Sale>();
    const stocks=await db.prepare('SELECT "id","productId","value","cost","expiresAt","state","saleId","createdAt" FROM stocks WHERE "saleId"=$1 ORDER BY "createdAt","id"').bind(saleId).all();
    return json({id:saleId,receipt:{sale:visibleRecord(sale!,owner),stocks:stocks.results.map(s=>visibleRecord(s as Record<string,unknown>,owner))}});
  };
  try {
    const db=getInventoryDb(),now=new Date().toISOString();
    await ensureDbSchema(db);
    if(data.action==="product") {
      const isEdit=!!data.id;
      const productId=data.id||crypto.randomUUID();
      const waTemplate = data.waTemplate?.trim() || null;
      if(isEdit){
        const changed=await db.batch([
          db.prepare('UPDATE products SET "name"=$1,"category"=$2,"type"=$3,"duration"=$4,"price"=$5,"cost"=$6,"minStock"=$7,"resellerPrice"=$8,"warrantyHours"=$9,"waTemplate"=$10 WHERE "id"=$11').bind(data.name,data.category,data.type,data.duration,data.price,data.cost,data.minStock,data.resellerPrice,data.warrantyHours,waTemplate,productId),
          db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,0,$4)').bind(crypto.randomUUID(),"edit",`${data.name} · ${data.duration} · ${operator.name}`,now),
        ]);
        if(!changed[0].meta.changes)return json({error:"Produk tidak ditemukan."},404);
      }else{
        await db.batch([
          db.prepare('INSERT INTO products ("name","category","type","duration","price","cost","minStock","resellerPrice","warrantyHours","waTemplate","id","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)').bind(data.name,data.category,data.type,data.duration,data.price,data.cost,data.minStock,data.resellerPrice,data.warrantyHours,waTemplate,productId,now),
          db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,0,$4)').bind(crypto.randomUUID(),"product",`${data.name} · ${data.duration} · ${operator.name}`,now),
        ]);
      }
      return json({id:productId});
    }
    if(data.action==="bulkProducts") {
      const statements: ReturnType<CompatDb["prepare"]>[] = [];
      let totalStockInserted = 0;
      for(const p of data.products) {
        const pid = crypto.randomUUID();
        statements.push(
          db.prepare('INSERT INTO products ("name","category","type","duration","price","cost","minStock","resellerPrice","warrantyHours","id","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)').bind(p.name,p.category,p.type,p.duration,p.price,p.cost,p.minStock,p.resellerPrice,p.warrantyHours,pid,now)
        );
        if (p.initialStock && p.initialStock.length > 0) {
          const batch = crypto.randomUUID();
          const uniqueLines = [...new Set(p.initialStock)];
          for (const line of uniqueLines) {
            statements.push(
              db.prepare('INSERT INTO stocks ("id","productId","value","cost","expiresAt","state","batchId","createdAt") VALUES ($1,$2,$3,$4,NULL,\'ready\',$5,$6) ON CONFLICT DO NOTHING').bind(crypto.randomUUID(), pid, line, p.cost, batch, now)
            );
          }
          totalStockInserted += uniqueLines.length;
        }
      }
      statements.push(
        db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,$4,$5)').bind(crypto.randomUUID(), "product", `Impor massal: ${data.products.length} produk baru${totalStockInserted > 0 ? ` & ${totalStockInserted} stok awal` : ""} · ${operator.name}`, data.products.length, now)
      );
      await db.batch(statements);
      return json({ inserted: data.products.length, stockInserted: totalStockInserted });
    }
    if(data.action==="restock") {
      const p=await db.prepare('SELECT * FROM products WHERE "id"=$1').bind(data.productId).first<Product>();
      if(!p)return json({error:"Produk tidak ditemukan."},404);
      if(data.expiresAt&&data.expiresAt<today())return json({error:"Tanggal kedaluwarsa sudah lewat."},400);
      const batch=crypto.randomUUID(),lines=[...new Set(data.lines)];
      const inserts=lines.map(line=>db.prepare('INSERT INTO stocks ("id","productId","value","cost","expiresAt","state","batchId","createdAt") VALUES ($1,$2,$3,$4,$5,\'ready\',$6,$7) ON CONFLICT DO NOTHING').bind(crypto.randomUUID(),p.id,line,data.cost??p.cost,data.expiresAt??null,batch,now));
      // Count inserted stocks after batch
      const activityStmt = db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") SELECT $1,\'restock\',$2,COUNT(*),$3 FROM stocks WHERE "batchId"=$4 HAVING COUNT(*)>0').bind(crypto.randomUUID(),`${p.name} · ${p.duration} · ${operator.name}${data.reference?` · ${data.reference}`:""}`,now,batch);
      const results=await db.batch([...inserts,activityStmt]);
      const inserted=results.slice(0,-1).reduce((sum,r)=>sum+(r.meta.changes||0),0);
      return json({inserted,duplicates:data.lines.length-inserted});
    }
    if(data.action==="sale") {
      const prior=await db.prepare('SELECT "id","requestFingerprint","actorId" FROM sales WHERE "id"=$1').bind(data.id).first<{id:string;requestFingerprint:string;actorId:string}>();
      if(prior){
        if(prior.actorId!==operator.id||prior.requestFingerprint!==fingerprint)return json({error:"Kode pengambilan sudah digunakan untuk permintaan lain. Periksa riwayat."},409);
        return await receipt(data.id);
      }
      const p=await db.prepare('SELECT * FROM products WHERE "id"=$1').bind(data.productId).first<Product>();
      if(!p)return json({error:"Produk tidak ditemukan."},404);
      const date=today(),replacement=data.kind==="replacement";
      let original:Sale|null=null,oldIds:string[]=[],newIds:string[]=[];
      if(replacement){
        if(!data.originalSaleId||!data.reference||!data.sourceStockIds.length||data.sourceStockIds.length!==data.quantity||new Set(data.sourceStockIds).size!==data.quantity)return json({error:"Pilih pesanan asal, akun bermasalah, dan isi alasan garansi. Maksimal 25 akun per proses."},400);
        original=await db.prepare(`SELECT ${salesColumns} FROM sales WHERE "id"=$1 AND "kind"='sale'`).bind(data.originalSaleId).first<Sale>();
        if(!original||original.productId!==p.id)return json({error:"Pesanan asal dan produk garansi tidak cocok."},400);
        if((!original.warrantyUntil||original.warrantyUntil<now)&&!data.allowExpired)return json({error:"Garansi belum diatur atau sudah berakhir. Minta owner memeriksa pesanan ini."},409);
        oldIds=data.sourceStockIds;
        // Check sources
        const sourcePlaceholders = oldIds.map((_,i)=>`$${i+1}`).join(",");
        const sources=await db.prepare(`SELECT s."id" FROM stocks s JOIN sales o ON o."id"=s."saleId" WHERE s."id" IN (${sourcePlaceholders}) AND s."productId"=$${oldIds.length+1} AND (o."id"=$${oldIds.length+2} OR o."originalSaleId"=$${oldIds.length+3}) AND NOT EXISTS (SELECT 1 FROM "warrantyClaims" c WHERE c."originalStockId"=s."id")`).bind(...oldIds,p.id,original.id,original.id).all();
        if(sources.results.length!==data.quantity)return json({error:"Akun sudah diganti atau bukan milik pesanan ini. Muat ulang data garansi."},409);
        const next=await db.prepare('SELECT "id" FROM stocks WHERE "productId"=$1 AND "state"=\'ready\' AND ("expiresAt" IS NULL OR "expiresAt">=$2) ORDER BY "expiresAt" IS NULL,"expiresAt","createdAt","id" LIMIT $3').bind(p.id,date,data.quantity).all<{id:string}>();
        newIds=next.results.map(s=>s.id);
        if(newIds.length!==data.quantity)return json({error:"Stok pengganti belum cukup. Tambahkan stok produk yang sama."},409);
      }else if(data.originalSaleId||data.sourceStockIds.length||data.allowExpired){return json({error:"Referensi akun garansi hanya untuk penggantian."},400);}
      const configuredPrice=data.priceTier==="reseller"?p.resellerPrice:p.price;
      if(!replacement&&data.price===undefined&&configuredPrice==null)return json({error:"Harga reseller belum diatur oleh owner."},400);
      const unitPrice=replacement?0:data.price??configuredPrice!;
      if(!replacement&&data.price===undefined&&data.expectedPrice!==undefined&&unitPrice!==data.expectedPrice)return json({error:"Harga sudah berubah. Muat ulang data sebelum mengambil stok."},409);
      const warrantyUntil=replacement?original!.warrantyUntil||null:p.warrantyHours?new Date(Date.parse(now)+p.warrantyHours!*3600000).toISOString():null;
      
      let statements: ReturnType<CompatDb["prepare"]>[];
      if(replacement){
        // Insert sale with cost from replacement stocks
        const newPlaceholders = newIds.map((_,i)=>`$${15+i}`).join(",");
        const oldPlaceholders2 = oldIds.map((_,i)=>`$${15+newIds.length+3+i}`).join(",");
        const insertSql = `INSERT INTO sales ("id","productId","productName","quantity","total","cost","customer","createdAt","kind","actorId","actorName","reference","requestFingerprint","originalSaleId","warrantyUntil") SELECT $1,$2,$3,$4,$5,COALESCE(SUM(s."cost"),0),$6,$7,$8,$9,$10,$11,$12,$13,$14 FROM stocks s WHERE s."id" IN (${newPlaceholders}) AND s."productId"=$${15+newIds.length} AND s."state"='ready' AND (s."expiresAt" IS NULL OR s."expiresAt">=$${15+newIds.length+1}) HAVING COUNT(*)=$${15+newIds.length+2} AND (SELECT COUNT(*) FROM stocks s2 JOIN sales o ON o."id"=s2."saleId" WHERE s2."id" IN (${oldPlaceholders2}) AND s2."productId"=$${15+newIds.length+3+oldIds.length} AND (o."id"=$${15+newIds.length+3+oldIds.length+1} OR o."originalSaleId"=$${15+newIds.length+3+oldIds.length+2}) AND NOT EXISTS (SELECT 1 FROM "warrantyClaims" c WHERE c."originalStockId"=s2."id"))=$${15+newIds.length+3+oldIds.length+3}`;
        statements=[
          db.prepare(insertSql).bind(data.id,p.id,`${p.name} · ${p.duration}`,data.quantity,unitPrice*data.quantity,replacement?original!.customer:data.customer,now,data.kind,operator.id,operator.name,data.reference,fingerprint,original?.id||null,warrantyUntil,...newIds,p.id,date,data.quantity,...oldIds,p.id,original!.id,original!.id,data.quantity),
          // Update replacement stocks
          db.prepare(`UPDATE stocks SET "state"='replaced',"saleId"=$1 WHERE "id" IN (${newIds.map((_,i)=>`$${2+i}`).join(",")}) AND EXISTS (SELECT 1 FROM sales WHERE "id"=$${2+newIds.length})`).bind(data.id,...newIds,data.id),
          // Create warranty claims
          ...oldIds.map((oldId,i)=>db.prepare('INSERT INTO "warrantyClaims" ("id","originalSaleId","originalStockId","replacementStockId","replacementSaleId","reason","override","createdAt") SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE EXISTS (SELECT 1 FROM sales WHERE "id"=$9)').bind(crypto.randomUUID(),original!.id,oldId,newIds[i],data.id,data.reference,data.allowExpired||0,now,data.id))
        ];
      }else{
        // Normal sale: select ready stocks, insert sale, update stocks
        const readyQuery = (p1: string, p2: string, p3: string) =>
          `SELECT "id","cost" FROM stocks WHERE "productId"=${p1} AND "state"='ready' AND ("expiresAt" IS NULL OR "expiresAt">=${p2}) ORDER BY "expiresAt" IS NULL,"expiresAt","createdAt","id" LIMIT ${p3}`;
        const insertSql = `INSERT INTO sales ("id","productId","productName","quantity","total","cost","customer","createdAt","kind","actorId","actorName","reference","requestFingerprint","originalSaleId","warrantyUntil") SELECT $1,$2,$3,$4,$5,COALESCE(SUM(sub."cost"),0),$6,$7,$8,$9,$10,$11,$12,$13,$14 FROM (${readyQuery('$15','$16','$17')}) sub HAVING COUNT(*)=$18`;
        statements=[
          db.prepare(insertSql).bind(data.id,p.id,`${p.name} · ${p.duration}`,data.quantity,unitPrice*data.quantity,data.customer,now,data.kind,operator.id,operator.name,data.reference,fingerprint,original?.id||null,warrantyUntil,p.id,date,data.quantity,data.quantity),
          db.prepare(`UPDATE stocks SET "state"='sold',"saleId"=$1 WHERE "id" IN (SELECT "id" FROM (${readyQuery('$2','$3','$4')}) sub2) AND EXISTS (SELECT 1 FROM sales WHERE "id"=$5)`).bind(data.id,p.id,date,data.quantity,data.id)
        ];
      }
      statements.push(db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") SELECT $1,"kind","productName"||\' · \'||"actorName","quantity","createdAt" FROM sales WHERE "id"=$2').bind(crypto.randomUUID(),data.id));
      const saved=await db.batch(statements);
      if(!saved[0].meta.changes)return json({error:replacement?"Stok atau klaim sudah diproses admin lain. Muat ulang sebelum melanjutkan.":"Stok siap jual tidak cukup. Muat ulang untuk melihat stok terbaru."},409);
      return await receipt(data.id);
    }
    if(data.action==="stockState"){
      const changed=await db.batch([
        db.prepare(`UPDATE stocks SET "state"=$1 WHERE "id"=$2 AND "state" IN ('ready','invalid') AND "saleId" IS NULL AND "state"!=$3`).bind(data.state,data.id,data.state),
        db.prepare(`INSERT INTO activities ("id","kind","message","quantity","createdAt") SELECT $1,$2,p."name"||' · '||p."duration"||$3,1,$4 FROM stocks s JOIN products p ON s."productId"=p."id" WHERE s."id"=$5`).bind(crypto.randomUUID(),data.state==="invalid"?"invalid":"restore",` · ${operator.name}`,now,data.id),
      ]);
      if(!changed[0].meta.changes)return json({error:"Stok sudah diambil atau status sudah diperbarui."},409);
      return json({ok:true});
    }
    if(data.action==="deleteProduct"){
      const p=await db.prepare('SELECT "name","duration" FROM products WHERE "id"=$1').bind(data.id).first<Product>();
      if(!p)return json({error:"Produk tidak ditemukan."},404);
      const statements: ReturnType<CompatDb["prepare"]>[]=[];
      if(data.deleteStocks || data.force){
        statements.push(db.prepare('DELETE FROM stocks WHERE "productId"=$1 AND "saleId" IS NULL').bind(data.id));
        statements.push(db.prepare('DELETE FROM products WHERE "id"=$1').bind(data.id));
      }else{
        statements.push(db.prepare('DELETE FROM products WHERE "id"=$1 AND NOT EXISTS (SELECT 1 FROM stocks WHERE "productId"=$2) AND NOT EXISTS (SELECT 1 FROM sales WHERE "productId"=$3)').bind(data.id,data.id,data.id));
      }
      statements.push(db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,\'delete\',$2,0,$3)').bind(crypto.randomUUID(),`${p.name} · ${p.duration} · ${operator.name}`,now));
      const results=await db.batch(statements);
      const deleteRes=results[statements.length-2];
      if(!deleteRes.meta.changes)return json({error:"Produk dengan stok atau riwayat tidak dapat dihapus."},409);
      return json({ok:true});
    }
    if(data.action==="bulkDeleteProducts"){
      const ids=[...new Set(data.ids)];
      if(!ids.length)return json({error:"Pilih minimal 1 produk untuk dihapus."},400);
      const statements: ReturnType<CompatDb["prepare"]>[]=[];
      const idsPlaceholders = ids.map((_,i)=>`$${i+1}`).join(",");
      if(data.deleteStocks){
        statements.push(db.prepare(`DELETE FROM stocks WHERE "productId" IN (${idsPlaceholders}) AND "saleId" IS NULL`).bind(...ids));
        statements.push(
          db.prepare(`DELETE FROM products WHERE "id" IN (${idsPlaceholders})`).bind(...ids)
        );
      }else{
        statements.push(
          db.prepare(`DELETE FROM products WHERE "id" IN (${idsPlaceholders}) AND NOT EXISTS (SELECT 1 FROM stocks WHERE "productId"=products."id") AND NOT EXISTS (SELECT 1 FROM sales WHERE "productId"=products."id")`).bind(...ids)
        );
      }
      statements.push(
        db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1, \'delete\', $2, 0, $3)').bind(crypto.randomUUID(), `Hapus massal: ${ids.length} produk · ${operator.name}`, now)
      );
      const results=await db.batch(statements);
      const deleteProductRes=results[statements.length-2];
      const deleted=deleteProductRes?.meta?.changes||0;
      return json({ok:true,deleted,skipped:ids.length-deleted});
    }
    if(data.action==="deleteSale"){
      const sale=await db.prepare('SELECT * FROM sales WHERE "id"=$1').bind(data.id).first<Sale>();
      if(!sale)return json({error:"Data transaksi tidak ditemukan."},404);
      const statements: ReturnType<CompatDb["prepare"]>[]=[];
      if(data.restoreStock){
        statements.push(db.prepare(`UPDATE stocks SET "state"='ready', "saleId"=NULL WHERE "saleId"=$1`).bind(data.id));
      }else{
        statements.push(db.prepare('DELETE FROM stocks WHERE "saleId"=$1').bind(data.id));
      }
      statements.push(
        db.prepare('DELETE FROM "warrantyClaims" WHERE "originalSaleId"=$1 OR "replacementSaleId"=$2').bind(data.id,data.id),
        db.prepare('DELETE FROM sales WHERE "id"=$1').bind(data.id),
        db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,$4,$5)').bind(crypto.randomUUID(),"delete",`Hapus riwayat transaksi #${data.id.slice(0,8)} (${sale.productName}) · ${operator.name}`,sale.quantity,now)
      );
      await db.batch(statements);
      return json({ok:true,deleted:1});
    }
    if(data.action==="clearSalesHistory"){
      const statements: ReturnType<CompatDb["prepare"]>[]=[];
      if(data.restoreStock){
        statements.push(db.prepare(`UPDATE stocks SET "state"='ready', "saleId"=NULL WHERE "saleId" IS NOT NULL`));
      }else{
        statements.push(db.prepare('DELETE FROM stocks WHERE "saleId" IS NOT NULL'));
      }
      statements.push(
        db.prepare('DELETE FROM "warrantyClaims"'),
        db.prepare('DELETE FROM sales'),
        db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,0,$4)').bind(crypto.randomUUID(),"delete",`Reset seluruh riwayat penjualan · ${operator.name}`,now)
      );
      await db.batch(statements);
      return json({ok:true});
    }
    if(data.action==="updateSettings") {
      await db.batch([
        db.prepare('INSERT INTO "storeSettings" ("key","value","updatedAt") VALUES ($1,$2,$3) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=EXCLUDED."updatedAt"').bind(data.key,data.value,now),
        db.prepare('INSERT INTO activities ("id","kind","message","quantity","createdAt") VALUES ($1,$2,$3,0,$4)').bind(crypto.randomUUID(),"settings",`Ubah template WhatsApp toko · ${operator.name}`,now)
      ]);
      return json({ok:true});
    }
    return json({error:"Aksi tidak dikenal."},400);
  }catch(err){
    console.error("Inventory write failed",data.action,err);
    if(data.action==="sale"){
      try{
        const prior=await getInventoryDb().prepare('SELECT "requestFingerprint","actorId" FROM sales WHERE "id"=$1').bind(data.id).first<{requestFingerprint:string;actorId:string}>();
        if(prior&&prior.actorId===operator.id&&prior.requestFingerprint===fingerprint)return await receipt(data.id);
        if(prior)return json({error:"Kode pengambilan sudah digunakan untuk permintaan lain. Periksa riwayat."},409);
      }catch{}
      return json({error:"Status pengambilan belum dapat dipastikan. Pulihkan pengambilan yang sama; stok tidak akan diambil dua kali."},503);
    }
    return json({error:"Perubahan belum dapat disimpan. Data formulir tetap tersedia."},503);
  }
}
