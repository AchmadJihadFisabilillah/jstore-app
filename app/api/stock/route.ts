import { getInventoryDb, ensureDbSchema } from "@/db";
import { operatorFromRequest, visibleRecord } from "@/lib/operator";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
  try{
    const operator=await operatorFromRequest(request);
    if(!operator)return json({error:"Sesi masuk tidak ditemukan."},401);
    const {searchParams}=new URL(request.url),product=searchParams.get("product"),sale=searchParams.get("sale"),active=searchParams.get("activeWarranty")==="1";
    if(!product&&!sale)return json({error:"Pilih produk atau transaksi."},400);
    const db=getInventoryDb(),owner=operator.role==="owner";
    await ensureDbSchema(db);
    let result;
    if(active&&sale){
      result=await db.prepare('SELECT s.* FROM stocks s JOIN sales o ON o."id"=s."saleId" WHERE (o."id"=$1 OR o."originalSaleId"=$2) AND NOT EXISTS (SELECT 1 FROM "warrantyClaims" c WHERE c."originalStockId"=s."id") ORDER BY s."createdAt",s."id"').bind(sale,sale).all();
    }else if(sale){
      result=await db.prepare('SELECT * FROM stocks WHERE "saleId"=$1 ORDER BY "createdAt","id"').bind(sale).all();
    }else{
      result=await db.prepare('SELECT * FROM stocks WHERE "productId"=$1 ORDER BY "createdAt" DESC').bind(product).all();
    }
    return json({stocks:result.results.map(s=>{
      const safe=visibleRecord(s as Record<string,unknown>,owner);
      // Admins reveal credentials through an allocated order, so unallocated stock cannot bypass a sale.
      if(!owner&&!sale)delete safe.value;
      return safe;
    })});
  }catch{return json({error:"Detail stok belum dapat dimuat. Silakan coba lagi."},503);}
}
