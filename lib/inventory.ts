export type Product = { id: string; name: string; category: string; type: string; duration: string; price: number; cost: number; minStock: number; createdAt: string; resellerPrice?: number | null; warrantyHours?: number; waTemplate?: string | null };
export type Stock = { id: string; productId: string; cost: number; expiresAt: string | null; state: string; saleId: string | null; createdAt: string; value?: string };
export type Sale = { id: string; productId: string; productName: string; quantity: number; total: number; cost: number; customer: string; createdAt: string; kind?: "sale" | "replacement"; actorId?: string; actorName?: string; reference?: string; originalSaleId?: string | null; warrantyUntil?: string | null };
export type WarrantyClaim = { id: string; originalSaleId: string; originalStockId: string; replacementStockId: string; replacementSaleId: string; reason: string; override: number; createdAt: string };
export type Viewer = { id: string; name: string; role: "owner" | "admin" };
export type TakeReceipt = { sale: Sale; stocks: Stock[] };
export type MutationResult = { ok?: boolean; id?: string; inserted?: number; duplicates?: number; stockInserted?: number; deleted?: number; skipped?: number; receipt?: TakeReceipt };
export type MutationPayload = { action: string; [key: string]: any };
export type MutateInventory = (data: MutationPayload) => Promise<MutationResult>;
export class InventoryMutationError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export function summarizeSales(records: Sale[]) {
  const sales = records.filter(s => s.kind !== "replacement");
  const omzet = sales.reduce((sum,s) => sum+s.total,0);
  const cost = sales.reduce((sum,s) => sum+(s.cost||0),0);
  const replacementCost = records.filter(s=>s.kind === "replacement").reduce((sum,s)=>sum+(s.cost||0),0);
  return { omzet, cost, grossProfit: omzet-cost, replacementCost, afterReplacement: omzet-cost-replacementCost, quantity:sales.reduce((sum,s)=>sum+s.quantity,0), transactions:sales.length };
}
export type Activity = { id: string; kind: string; message: string; quantity: number; createdAt: string };
export type Inventory = { products: Product[]; stocks: Stock[]; sales: Sale[]; activities: Activity[]; claims?: WarrantyClaim[]; viewer?: Viewer; defaultWaTemplate?: string };
export const emptyInventory: Inventory = { products: [], stocks: [], sales: [], activities: [] };
export const categories = ["AI & Produktivitas", "Editing & Desain", "Musik", "Streaming", "Lainnya"];
export const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
export const num = (value: number) => new Intl.NumberFormat("id-ID").format(value);
export function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export const isExpired = (s: Stock) => !!s.expiresAt && s.expiresAt < today();
export const isReady = (s: Stock) => s.state === "ready" && !isExpired(s);
export const formatDate = (date: string, time = false) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" } : {}) }).format(new Date(date));
export function exampleInventory(): Inventory {
  const now = new Date();
  const at = (days: number, hours = 0) => new Date(now.getTime() - days * 86400000 - hours * 3600000).toISOString();
  const future = (days: number) => new Date(now.getTime() + days * 86400000).toISOString().slice(0,10);
  const seeds: [string,string,string,string,number,number,number][] = [
    ["Gemini Pro", "AI & Produktivitas", "link", "18 bulan", 10000, 7000, 124],
    ["CapCut Pro", "Editing & Desain", "account", "7 hari", 2000, 1200, 86],
    ["Spotify Premium", "Musik", "account", "3 bulan", 4500, 3000, 42],
    ["Netflix Premium", "Streaming", "account", "1 bulan", 25000, 19000, 6],
    ["Canva Pro", "Editing & Desain", "link", "1 bulan", 8000, 4000, 3],
    ["CapCut Pro", "Editing & Desain", "account", "1 bulan", 21000, 17000, 0],
  ];
  const data: Inventory = { products: [], stocks: [], sales: [], activities: [] };
  for (let k=0;k<seeds.length;k++) {
    const [name,category,type,duration,price,cost,qty]=seeds[k];
    const id = `demo-product-${k}`;
    data.products.push({id,name,category,type,duration,price,cost,minStock:10,warrantyHours:24,resellerPrice:Math.round(price*.9),createdAt:at(12)});
    for(let i=0;i<qty;i++) data.stocks.push({id:`demo-stock-${k}-${i}`,productId:id,cost,expiresAt:k===0?future(i<8?2:14):null,state:"ready",saleId:null,createdAt:at(k%3),value:type==="link"?`https://example.com/contoh-${k}-${i+1}`:`contoh${i+1}@example.com|sandi-contoh`});
  }
  for(let day=6;day>=0;day--) for(let j=0;j<3;j++) {
    const p=data.products[(day+j)%3], quantity=[12,8,15,6,18,11,22][day]+j*2;
    const id=`demo-sale-${day}-${j}`, createdAt=at(day,j+1);
    data.sales.push({id,productId:p.id,productName:`${p.name} · ${p.duration}`,quantity,total:quantity*p.price,cost:quantity*p.cost,customer:["Pelanggan contoh A","Pelanggan contoh B","Reseller contoh"][j],createdAt,actorName:"Admin contoh",kind:"sale",warrantyUntil:new Date(Date.parse(createdAt)+24*3600000).toISOString()});
    for(let n=0;n<quantity;n++) data.stocks.push({id:`demo-sold-${day}-${j}-${n}`,productId:p.id,cost:p.cost,expiresAt:null,state:"sold",saleId:id,createdAt:at(8),value:`stok-contoh-terjual-${day}-${j}-${n}`});
    data.activities.push({id:`activity-${id}`,kind:"sale",message:`${p.name} · ${p.duration}`,quantity,createdAt});
  }
  data.activities.push({id:"demo-restock-1",kind:"restock",message:"Gemini Pro · 18 bulan",quantity:124,createdAt:at(0,0.3)});
  data.activities.push({id:"demo-restock-2",kind:"restock",message:"CapCut Pro · 7 hari",quantity:86,createdAt:at(0,0.7)});
  data.sales.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  data.activities.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return data;
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    try {
      return ("" + 1e7 + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: any) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
      );
    } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
