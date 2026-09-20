"use client";
import {useState} from "react";
import {Search,ShieldCheck,ArrowRight} from "lucide-react";
import {useOperator} from "@/components/operator-context";
import {activeWarrantyStocks} from "@/components/quick-take-form";
import {formatDate,type Inventory,type Sale} from "@/lib/inventory";
export function WarrantyDesk({data,onProcess,onDetail}:{data:Inventory;onProcess:(sale:Sale)=>void;onDetail:(sale:Sale)=>void}){
  const owner=useOperator().role==="owner",[query,setQuery]=useState(""),[page,setPage]=useState(1);
  const orders=data.sales.filter(s=>s.kind!=="replacement"&&`${s.id} ${s.customer} ${s.reference||""} ${s.productName}`.toLowerCase().includes(query.toLowerCase()));
  const pages=Math.max(1,Math.ceil(orders.length/12)),current=Math.min(page,pages);
  return <div className="panel warranty-desk"><div className="panel-heading"><div><h2>Garansi pelanggan</h2><p>Cari pesanan asal, pilih akun bermasalah, lalu ambil penggantinya.</p></div><ShieldCheck size={22}/></div><div className="table-toolbar"><div className="searchbox"><Search/><input aria-label="Cari pesanan garansi" placeholder="ID pesanan, pelanggan, produk, atau nomor order…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div></div><div className="warranty-order-list">{orders.slice((current-1)*12,current*12).map(s=>{
    const active=!!s.warrantyUntil&&s.warrantyUntil>=new Date().toISOString(),units=activeWarrantyStocks(data,s.id).length,claims=(data.claims||[]).filter(c=>c.originalSaleId===s.id);
    return <article className="warranty-order" key={s.id}><div><span className={`badge badge-${active?"green":"orange"}`}>{active?"Garansi aktif":s.warrantyUntil?"Garansi berakhir":"Perlu cek owner"}</span><h3>{s.productName}</h3><p>#{s.id.slice(0,10).toUpperCase()} · {s.customer||"Tanpa nama pelanggan"}{s.reference&&` · ${s.reference}`}</p><small>{s.warrantyUntil?`Garansi s.d. ${formatDate(s.warrantyUntil,true)} WIB`:"Masa garansi tidak tercatat pada pesanan ini."}</small><small>{s.quantity} unit dibeli · {claims.length} penggantian tercatat</small></div><div className="warranty-order-actions"><button className="btn btn-small" onClick={()=>onDetail(s)}>Lihat pesanan</button><button className="btn btn-primary btn-small" disabled={!units||!active&&!owner} onClick={()=>onProcess(s)}><ShieldCheck/>{!active&&owner?"Periksa & proses":"Proses garansi"}</button></div></article>;
  })}{!orders.length&&<div className="empty-state">Belum ada pesanan yang cocok. Penjualan baru otomatis muncul di sini.</div>}</div><div className="table-footer"><span>{orders.length} pesanan · {current}/{pages}</span><div className="take-presets"><button className="btn btn-small" disabled={current===1} onClick={()=>setPage(current-1)}>Sebelumnya</button><button className="btn btn-small" disabled={current===pages} onClick={()=>setPage(current+1)}>Berikutnya <ArrowRight size={13}/></button></div></div></div>;
}
