"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Check,ChevronDown,Copy,Download,Loader2,PackageCheck,ShoppingBag,ShieldCheck,Search} from "lucide-react";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from "@/components/ui/collapsible";
import {Switch} from "@/components/ui/switch";
import {toast} from "sonner";
import {requestJSON,isDefinitiveRejection} from "@/lib/client-request";
import {useOperator} from "@/components/operator-context";
import {InventoryMutationError,isReady,money,formatDate,generateUUID,type Inventory,type Product,type MutationPayload,type MutateInventory,type TakeReceipt,type Stock} from "@/lib/inventory";
import {formatWhatsAppMessage} from "@/lib/whatsapp-template";
export const pendingTakeKey="jstore-pending-take-v1";
function pendingDraft():MutationPayload|null{
  try{const d=JSON.parse(sessionStorage.getItem(pendingTakeKey)||"null");if(d?.action==="sale"&&typeof d.id==="string"&&typeof d.productId==="string"&&Number.isInteger(d.quantity)&&d.quantity>0)return d;}catch{}return null;
}
function rememberDraft(value:MutationPayload|null){
  // Recovery metadata only; account credentials and the authoritative ledger stay on the server.
  try{if(value)sessionStorage.setItem(pendingTakeKey,JSON.stringify(value));else sessionStorage.removeItem(pendingTakeKey);}catch{}
}
export function activeWarrantyStocks(data:Inventory,rootId:string){
  const orders=new Set(data.sales.filter(o=>o.id===rootId||o.originalSaleId===rootId).map(o=>o.id));
  const claimed=new Set((data.claims||[]).map(c=>c.originalStockId));
  return data.stocks.filter(s=>s.saleId&&orders.has(s.saleId)&&!claimed.has(s.id));
}
export function QuickTakeForm({data,product,initialWarranty,demo,mutate,close,onLock}:{data:Inventory;product?:Product;initialWarranty?:string;demo:boolean;mutate:MutateInventory;close:()=>void;onLock:(locked:boolean)=>void}){
  const owner=useOperator().role==="owner";
  const initialOrder=data.sales.find(s=>s.id===initialWarranty);
  const [pid,setPid]=useState(initialOrder?.productId||product?.id||data.products.find(p=>data.stocks.some(s=>s.productId===p.id&&isReady(s)))?.id||data.products[0]?.id||"");
  const [kind,setKind]=useState(initialWarranty?"replacement":"sale"),[qty,setQty]=useState("1"),[tier,setTier]=useState("retail"),[custom,setCustom]=useState(false),[price,setPrice]=useState(""),[customer,setCustomer]=useState(""),[reference,setReference]=useState("");
  const [rootId,setRootId]=useState(initialWarranty||""),[sourceIds,setSourceIds]=useState<string[]>([]),[sources,setSources]=useState<Stock[]>([]),[sourcesLoading,setSourcesLoading]=useState(false),[sourcesError,setSourcesError]=useState(""),[sourceReload,setSourceReload]=useState(0),[override,setOverride]=useState(false);
  const [query,setQuery]=useState(""),[productQuery,setProductQuery]=useState(""),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(""),[receipt,setReceipt]=useState<TakeReceipt|null>(null);
  const inFlight=useRef(false),attempt=useRef<MutationPayload|null>(null);
  useEffect(()=>{
    if(demo)return;const d=pendingDraft();if(!d)return;
    attempt.current=d;setPid(String(d.productId));setQty(String(d.quantity));setKind(String(d.kind||"sale"));setCustom(d.price!==undefined);setPrice(String(d.price??""));setTier(String(d.priceTier||"retail"));setCustomer(String(d.customer||""));setReference(String(d.reference||""));setRootId(String(d.originalSaleId||""));setSourceIds(Array.isArray(d.sourceStockIds)?d.sourceStockIds:[]);setOverride(d.allowExpired===1);setUncertain(true);setError("Pulihkan pengambilan sebelumnya untuk memeriksa hasilnya tanpa mengambil stok dua kali.");
  },[demo]);
  useEffect(()=>{
    if(!rootId){setSources([]);return;}
    if(demo){setSources(activeWarrantyStocks(data,rootId));return;}
    const controller=new AbortController();setSourcesLoading(true);setSourcesError("");setSources([]);
    requestJSON(`/api/stock?sale=${encodeURIComponent(rootId)}&activeWarranty=1`,{cache:"no-store",signal:controller.signal}).then(r=>{const d=r.body;if(!r.ok)throw new Error(d.error);setSources(d.stocks);}).catch(e=>{if(e.name!=="AbortError")setSourcesError(e.message||"Akun pesanan belum dapat dimuat.");}).finally(()=>{if(!controller.signal.aborted)setSourcesLoading(false);});
    return()=>controller.abort();
  },[rootId,demo,data,sourceReload]);
  const p=data.products.find(p=>p.id===pid),original=data.sales.find(o=>o.id===rootId),replacement=kind==="replacement";
  const expired=!original?.warrantyUntil||original.warrantyUntil<new Date().toISOString();
  const available=data.stocks.filter(s=>s.productId===pid&&isReady(s)).sort((a,b)=>(a.expiresAt||"9999").localeCompare(b.expiresAt||"9999")||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const quantity=replacement?sourceIds.length:Number(qty)||0,unitPrice=replacement?0:custom?Number(price||0):tier==="reseller"?p?.resellerPrice??0:p?.price||0;
  const estimateCost=available.slice(0,quantity).reduce((sum,s)=>sum+(s.cost||0),0),estimateRevenue=quantity*unitPrice;
  const orders=data.sales.filter(o=>o.kind!=="replacement"&&`${o.id} ${o.customer} ${o.reference||""} ${o.productName}`.toLowerCase().includes(query.toLowerCase())).slice(0,40);
  const products=data.products.filter(x=>x.id===pid||`${x.name} ${x.duration}`.toLowerCase().includes(productQuery.toLowerCase()));
  const locked=busy||uncertain;
  function chooseOrder(value:string){setRootId(value);setSourceIds([]);setOverride(false);setPid(data.sales.find(o=>o.id===value)?.productId||"");setError("");}
  async function submit(e:FormEvent){
    e.preventDefault();if(inFlight.current)return;
    if(!attempt.current){
      if(!p||!Number.isInteger(quantity)||quantity<1||quantity>available.length){setError("Jumlah harus sesuai stok siap jual yang tersedia.");return;}
      if(replacement&&(!rootId||!reference.trim()||sourceIds.length>25||sourcesLoading||sourcesError)){setError("Pilih pesanan asal dan akun bermasalah, lalu isi alasan. Maksimal 25 akun per proses.");return;}
      if(replacement&&expired&&!(owner&&override)){setError("Garansi belum diatur atau sudah berakhir. Perlu pemeriksaan owner.");return;}
      if(!replacement&&custom&&(!price.trim()||!Number.isInteger(Number(price))||Number(price)<0||Number(price)>1000000000)){setError("Isi harga khusus dengan nominal rupiah yang valid.");return;}
      if(!replacement&&!custom&&tier==="reseller"&&p.resellerPrice==null){setError("Harga reseller belum diatur.");return;}
    }
    const payload:MutationPayload=attempt.current||{action:"sale",id:generateUUID(),productId:pid,quantity,kind,customer:replacement?"":customer.trim(),reference:reference.trim(),...(replacement?{originalSaleId:rootId,sourceStockIds:sourceIds,...(override&&owner?{allowExpired:1}:{})}:{priceTier:tier,...(custom&&owner?{price:Number(price)}:{expectedPrice:unitPrice})})};
    attempt.current=payload;if(!demo)rememberDraft(payload);inFlight.current=true;setBusy(true);onLock(true);setError("");
    try{
      const result=await mutate(payload);if(!result.receipt)throw new Error("Hasil pengambilan belum dapat dimuat.");
      setReceipt(result.receipt);setUncertain(false);attempt.current=null;if(!demo)rememberDraft(null);
      try{await navigator.clipboard.writeText(result.receipt.stocks.map(s=>s.value).join("\n"));toast.success("Stok diambil, tercatat, dan disalin");}catch{toast.success("Stok tersimpan. Gunakan tombol salin di bawah.");}
    }catch(e){
      if(e instanceof InventoryMutationError&&isDefinitiveRejection(e.status)){attempt.current=null;if(!demo)rememberDraft(null);setUncertain(false);if(replacement){setSourceIds([]);setSourceReload(n=>n+1);}}
      else setUncertain(true);
      setError((e as Error).message||"Pengambilan belum dapat dipastikan. Pulihkan dengan tombol di bawah.");
    }finally{inFlight.current=false;setBusy(false);onLock(false);}
  }
  function discardPending(){attempt.current=null;if(!demo)rememberDraft(null);setUncertain(false);setError("");toast.info("Draft pengambilan dibatalkan.");}
  function next(){setReceipt(null);setError("");setSourceIds([]);setReference("");setCustomer("");setOverride(false);setRootId("");setKind("sale");setQty("1");setCustom(false);}
  if(receipt){
    const sale=receipt.sale,isReplacement=sale.kind==="replacement",text=receipt.stocks.map(s=>s.value).join("\n");
    const prod=data.products.find(pr=>pr.id===sale.productId)||p;
    const customerChat=formatWhatsAppMessage(prod?.waTemplate||data.defaultWaTemplate,{customer:sale.customer,productName:sale.productName,duration:prod?.duration,credentials:text,warrantyUntil:sale.warrantyUntil,orderId:sale.id,total:sale.total,actorName:sale.actorName,createdAt:sale.createdAt});
    return <div className="form-stack take-result">
      <div className="take-success"><PackageCheck/><div><strong>{isReplacement?"Penggantian garansi tercatat":"Stok berhasil diambil"}</strong><p>{sale.quantity} unit · {sale.productName}</p></div></div>
      <div className="take-meta">#{sale.id.slice(0,10).toUpperCase()} · {sale.actorName||"Admin"}{sale.originalSaleId&&` · Pesanan asal #${sale.originalSaleId.slice(0,10).toUpperCase()}`}</div>
      <div className="take-totals"><div><span>{isReplacement?"Omzet tambahan":"Omzet tercatat"}</span><strong>{money(isReplacement?0:sale.total)}</strong></div>{owner&&<div><span>{isReplacement?"Biaya penggantian":"Laba kotor"}</span><strong>{money(isReplacement?sale.cost:sale.total-sale.cost)}</strong></div>}</div>
      {sale.warrantyUntil&&<p className="take-meta">Garansi s.d. {formatDate(sale.warrantyUntil,true)} WIB</p>}
      
      <div className="field">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-xs text-[#525760]">Kredensial Akun / Link Pesanan:</span>
          <button type="button" className="text-xs text-[#e77740] hover:underline flex items-center gap-1" onClick={async()=>{try{await navigator.clipboard.writeText(customerChat);toast.success("Format pesan chat disalin ke clipboard!");}catch{}}}>
            <Copy size={12}/> Salin Format Chat WA
          </button>
        </div>
        <textarea readOnly value={text} rows={Math.min(6, Math.max(3, receipt.stocks.length))} className="font-mono text-xs p-2.5 rounded-lg border border-[#dedad1] bg-[#faf9f5] w-full" onFocus={e=>e.currentTarget.select()}/>
      </div>

      {receipt.stocks.length > 1 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {receipt.stocks.map((s, idx) => (
            <div key={s.id || idx} className="flex items-center justify-between bg-white border border-[#eeebe4] rounded-md p-2 text-xs">
              <span className="font-mono text-[#33373f] truncate flex-1 mr-2"><code>{s.value}</code></span>
              <button type="button" className="icon-btn" title="Salin akun ini" onClick={async()=>{try{await navigator.clipboard.writeText(s.value||"");toast.success(`Akun #${idx+1} disalin`);}catch{}}}>
                <Copy size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="take-meta">Salin ulang atau unduh tidak mengurangi stok lagi.</p>
      <div className="take-presets">
        <button type="button" className="btn btn-primary" onClick={async()=>{try{await navigator.clipboard.writeText(text);toast.success("Semua akun berhasil disalin!");}catch{toast.error("Pilih teks akun di atas lalu salin secara manual.");}}}><Copy size={14}/>Salin Akun</button>
        <button type="button" className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(customerChat);toast.success("Format pesan pelanggan disalin!");}catch{}}}><Copy size={14}/>Salin Pesan WA</button>
        <button type="button" className="btn" onClick={()=>{const url=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`jstore-${sale.id.slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><Download size={14}/>Unduh .txt</button>
      </div>
      <div className="form-footer"><button type="button" className="btn" onClick={close}>Selesai</button><button type="button" className="btn btn-primary" onClick={next}>Pesanan berikutnya <ShoppingBag size={14}/></button></div>
    </div>;
  }
  return <form onSubmit={submit} className="form-stack"><fieldset disabled={locked} className="form-stack border-0 p-0 min-w-0">
    <Tabs value={kind} onValueChange={v=>{setKind(v);setError("");setReference("");}}><TabsList className="w-full"><TabsTrigger value="sale" disabled={locked}><ShoppingBag size={15}/>Penjualan</TabsTrigger><TabsTrigger value="replacement" disabled={locked}><ShieldCheck size={15}/>Garansi</TabsTrigger></TabsList></Tabs>
    {replacement?<><label className="field">Cari pesanan asal<div className="searchbox"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ID pesanan, pelanggan, atau produk"/></div></label><label className="field">Pesanan yang mendapat garansi<Select value={rootId} onValueChange={chooseOrder} disabled={locked}><SelectTrigger><SelectValue placeholder="Pilih pesanan asal"/></SelectTrigger><SelectContent>{(original&&!orders.some(o=>o.id===rootId)?[original,...orders]:orders).map(o=><SelectItem value={o.id} key={o.id}>#{o.id.slice(0,10).toUpperCase()} · {o.customer||"Tanpa nama"} · {o.productName}</SelectItem>)}</SelectContent></Select><small>Menampilkan hingga 40 hasil. Gunakan pencarian untuk pesanan lama.</small></label>{original&&<><div className={expired?"form-info warranty-expired":"form-info"}>{original.warrantyUntil?`Garansi ${expired?"berakhir":"s.d."} ${formatDate(original.warrantyUntil,true)} WIB`:"Masa garansi pesanan ini belum diatur."}{owner&&expired&&<label className="check-field"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/>Saya sebagai owner memberi pengecualian untuk klaim ini.</label>}</div><label className="field">Pilih akun yang bermasalah <small>Akun yang sudah diganti tidak dapat diklaim ulang. Pilih akun penggantinya jika masalah berulang.</small></label>{sourcesLoading?<p className="take-meta">Memuat akun pesanan…</p>:sourcesError?<div className="form-error">{sourcesError}<button type="button" className="btn btn-small" onClick={()=>setSourceReload(n=>n+1)}>Coba lagi</button></div>:<div className="warranty-accounts">{sources.length?sources.map((s,i)=><label className="warranty-account" key={s.id}><input type="checkbox" checked={sourceIds.includes(s.id)} onChange={e=>setSourceIds(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/><span><strong>{s.value?.startsWith("http")?`Link ${i+1}`:s.value?.split("|")[0]||`Akun ${i+1}`}</strong><small>#{s.id.slice(0,8).toUpperCase()} · {s.state==="replaced"?"Akun pengganti":"Akun pesanan awal"}</small></span></label>):<p className="take-meta">Tidak ada akun yang dapat dipilih.</p>}</div>}</>}<label className="field">Kendala / alasan garansi<input required value={reference} onChange={e=>setReference(e.target.value)} maxLength={150} placeholder="Contoh: gagal login, premium tidak aktif"/></label><div className="form-info">Penggantian memakai produk dan varian yang sama. Omzet tambahan Rp0; masa garansi mengikuti pesanan awal.</div></>:<><label className="field">Produk & varian{data.products.length>8&&<input value={productQuery} onChange={e=>setProductQuery(e.target.value)} placeholder="Cari produk…"/>}<Select value={pid} onValueChange={v=>{setPid(v);setTier("retail");setCustom(false);}} disabled={locked}><SelectTrigger><SelectValue placeholder="Pilih produk"/></SelectTrigger><SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.name} · {p.duration} ({data.stocks.filter(s=>s.productId===p.id&&isReady(s)).length} siap)</SelectItem>)}</SelectContent></Select></label><div className="form-row"><label className="field">Jumlah unit<input type="number" min={1} max={Math.min(available.length,10000)} step={1} value={qty} onChange={e=>setQty(e.target.value)} required autoFocus/></label><label className="field">Harga jual<Select value={tier} onValueChange={v=>{setTier(v);setCustom(false);}} disabled={locked}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="retail">Reguler · {money(p?.price||0)}</SelectItem>{p?.resellerPrice!=null&&<SelectItem value="reseller">Reseller · {money(p.resellerPrice)}</SelectItem>}</SelectContent></Select></label></div><div className="take-presets">{[1,5,10,25].map(n=><button type="button" key={n} className={`btn btn-small ${Number(qty)===n?"preset-active":""}`} disabled={n>available.length} onClick={()=>setQty(String(n))}>{n} unit</button>)}</div><Collapsible><CollapsibleTrigger type="button" className="take-options"><span>Referensi pesanan{owner?" & harga khusus":""} (opsional)</span><ChevronDown size={16}/></CollapsibleTrigger><CollapsibleContent className="form-stack pt-3"><div className="form-row"><label className="field">Nama pelanggan<input maxLength={150} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nama / username"/></label><label className="field">Nomor order / channel<input maxLength={150} value={reference} onChange={e=>setReference(e.target.value)} placeholder="WA / marketplace / nomor order"/></label></div>{owner&&<><div className="take-switch"><label htmlFor="custom-price">Gunakan harga khusus</label><Switch id="custom-price" checked={custom} onCheckedChange={v=>{setCustom(v);if(v)setPrice(String(unitPrice));}}/></div>{custom&&<label className="field">Harga khusus per unit (Rp)<input type="number" min={0} max={1000000000} step={1} value={price} onChange={e=>setPrice(e.target.value)} required/></label>}</>}</CollapsibleContent></Collapsible></>}
    <p className="take-meta">{p?`${p.name} · ${p.duration} · `:""}{available.length} stok siap. Stok dengan batas jual terdekat diambil lebih dulu.</p>
    <div className="take-totals"><div><span>{replacement?"Akun pengganti":"Total penjualan"}</span><strong>{replacement?`${quantity} unit`:money(estimateRevenue)}</strong></div>{owner&&<div><span>{replacement?"Estimasi biaya penggantian":"Estimasi laba kotor"}</span><strong>{money(replacement?estimateCost:estimateRevenue-estimateCost)}</strong></div>}</div>
    {!replacement&&<p className="take-meta">Tombol ini mencatat transaksi sebagai terjual. Gunakan setelah pembayaran dipastikan.</p>}
  </fieldset>{error&&<div className="form-error" role="alert">{error}</div>}<div className="form-footer">{uncertain?<><button type="button" className="btn text-red-600 border-red-200 hover:bg-red-50" onClick={discardPending} disabled={busy}>Batalkan draft</button><button type="button" className="btn" onClick={close} disabled={busy}>Tutup</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy?<Loader2 className="animate-spin"/>:<PackageCheck/>}{busy?"Memproses…":"Pulihkan pengambilan"}</button></>:<><button type="button" className="btn" onClick={close} disabled={busy}>Batal</button><button type="submit" className="btn btn-primary" disabled={busy||!quantity||quantity>available.length||replacement&&(!rootId||sourcesLoading||expired&&!(owner&&override))}>{busy?<Loader2 className="animate-spin"/>:replacement?<ShieldCheck/>:<Check/>}{busy?"Memproses…":replacement?"Ambil pengganti & salin":"Ambil, catat terjual & salin"}</button></>}</div></form>;
}
