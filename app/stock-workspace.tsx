"use client";

import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent, type ReactNode, type CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { LayoutDashboard, Boxes, ShoppingBag, History, Plus, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownLeft, Bell, Download, Upload, MoreHorizontal, ArrowRight, Store, ShieldCheck, Sparkles, Scissors, Music2, Film, Palette, Eye, EyeOff, Copy, Trash2, Pencil, RefreshCw, CircleAlert, Package, TrendingUp, Wallet, CalendarDays, Loader2, Timer, KeyRound, Check, Beaker, Link as LinkIcon, LogOut, User, FileSpreadsheet, Layers, MessageSquare } from "lucide-react";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { QuickTakeForm, pendingTakeKey, activeWarrantyStocks } from "@/components/quick-take-form";
import { requestJSON } from "@/lib/client-request";
import { RestockForm } from "@/components/restock-form";
import { WarrantyDesk } from "@/components/warranty-desk";
import { OperatorContext, useOperator } from "@/components/operator-context";
import { LoginView } from "@/components/login-view";
import { UserManagementModal } from "@/components/user-management-modal";
import { WaTemplateModal } from "@/components/wa-template-modal";
import { formatWhatsAppMessage, DEFAULT_WA_TEMPLATE, WA_TEMPLATE_TAGS } from "@/lib/whatsapp-template";
import { InventoryMutationError, summarizeSales, type MutationResult, categories, emptyInventory, exampleInventory, formatDate, isExpired, isReady, money, num, today, generateUUID, type Activity, type Inventory, type Product, type Sale, type Stock } from "@/lib/inventory";

type View = "dashboard" | "products" | "sales" | "warranty" | "activity";
type Payload = { action: string; [key: string]: any };
type Mutate = (data: Payload) => Promise<MutationResult>;
type Modal = { kind: "product" | "restock" | "sale"; product?: Product; initialWarranty?: string } | null;
const navItems = [{ id: "dashboard", label: "Ringkasan", icon: LayoutDashboard }, { id: "products", label: "Produk & stok", icon: Boxes }, { id: "sales", label: "Penjualan", icon: ShoppingBag }, { id: "warranty", label: "Garansi", icon: ShieldCheck }, { id: "activity", label: "Riwayat aktivitas", icon: History }] as const;
const typeLabels: Record<string,string> = { account: "Akun", link: "Link", license: "Lisensi", other: "Lainnya" };
const productName = (p: Product) => `${p.name} · ${p.duration}`;
const stockCount = (data: Inventory, p: Product) => data.stocks.filter(s=>s.productId===p.id && isReady(s)).length;
const status = (quantity: number, min: number) => quantity===0 ? {label:"Habis",color:"red"} : quantity<=min ? {label:"Menipis",color:"orange"} : {label:"Tersedia",color:"green"};
const localDay = (value: string) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));

function Choice({ value, onChange, options, label, className="" }: {value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string;className?:string}) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className={className}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
function Blank({ title, description, children }: {title:string;description?:string;children?:ReactNode}) {return <Empty className="empty-state"><EmptyHeader><EmptyMedia variant="icon"><Package/></EmptyMedia><EmptyTitle>{title}</EmptyTitle>{description&&<EmptyDescription>{description}</EmptyDescription>}</EmptyHeader>{children}</Empty>;}
function ProductSymbol({ product }: {product: Product}) {
  const n=product.name.toLowerCase();
  const kind=n.includes("gemini")?"gemini":n.includes("capcut")?"capcut":n.includes("spotify")?"spotify":n.includes("netflix")?"netflix":n.includes("canva")?"canva":"other";
  return <div className={`product-symbol ${kind}`} aria-hidden="true">{kind==="gemini"?<Sparkles/>:kind==="capcut"?<Scissors/>:kind==="spotify"?<Music2/>:kind==="netflix"?<span>N</span>:kind==="canva"?<Palette/>:<Package/>}</div>;
}
function StatusBadge({quantity,min}: {quantity:number;min:number}) {const s=status(quantity,min);return <span className={`badge badge-${s.color}`}>{s.label}</span>;}
function AppSidebar({view,setView,low,demo,setDemo,onLogout,onOpenUserModal,onOpenWaTemplateModal}: {view:View;setView:(v:View)=>void;low:number;demo:boolean;setDemo:(v:boolean)=>void;onLogout?:()=>void;onOpenUserModal?:()=>void;onOpenWaTemplateModal?:()=>void}) {
  const {setOpenMobile}=useSidebar(),operator=useOperator();
  const owner=operator.role==="owner";
  return <Sidebar><SidebarHeader className="px-3 pt-3"><div className="brand"><div className="brand-mark">j</div><div className="brand-name">jstore<span style={{color:"#e77740"}}>.</span><small>DIGITAL</small></div></div><div className="workspace-switch"><div className="store-icon"><Store size={17}/></div><div><strong>JStore Digital</strong><small>Manajemen stok</small></div></div></SidebarHeader><SidebarContent><SidebarGroup className="px-5"><SidebarGroupLabel className="nav-label">WORKSPACE</SidebarGroupLabel><SidebarMenu>{navItems.map(n=><SidebarMenuItem key={n.id}><SidebarMenuButton className="nav-button" isActive={view===n.id} onClick={()=>{setView(n.id);setOpenMobile(false);}}><n.icon/><span>{n.label}</span>{n.id==="products"&&low>0&&<span className="nav-count">{low}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>{owner&&<SidebarGroup className="px-5 mt-4"><SidebarGroupLabel className="nav-label">PENGATURAN</SidebarGroupLabel><SidebarMenu><SidebarMenuItem><SidebarMenuButton className="nav-button" onClick={()=>{onOpenUserModal?.();setOpenMobile(false);}}><KeyRound/><span>Akun & Admin</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton className="nav-button" onClick={()=>{onOpenWaTemplateModal?.();setOpenMobile(false);}}><MessageSquare/><span>Template WhatsApp</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>}<SidebarGroup className="px-5 mt-4"><SidebarGroupLabel className="nav-label">DATA TOKO</SidebarGroupLabel><SidebarMenu><SidebarMenuItem><SidebarMenuButton className="nav-button" onClick={()=>{setDemo(!demo);setOpenMobile(false);}}>{demo?<Store/>:<Beaker/>}<span>{demo?"Gunakan data toko":"Lihat data contoh"}</span><ArrowUpRight className="ml-auto"/></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup></SidebarContent><SidebarFooter className="p-0"><div className="sidebar-note"><ShieldCheck size={22}/><strong>Stok rapi.<br/>Jualan lebih tenang.</strong><p>Pantau ketersediaan produk dan siapkan restock tepat waktu.</p></div><div className="sidebar-profile"><div className="avatar">JS</div><div className="flex-1 min-w-0"><strong>{operator.name}</strong><small>{operator.role==="owner"?"Owner":"Admin toko"}</small>{onLogout&&<button type="button" className="logout-btn-compact" onClick={onLogout}><LogOut size={11}/><span>Ganti / Keluar</span></button>}</div><ShieldCheck className="ml-auto text-[#aaa18f]" size={16}/></div></SidebarFooter></Sidebar>;
}

export default function StockWorkspace() {
  const [live,setLive]=useState<Inventory>(emptyInventory), [sample,setSample]=useState<Inventory>(emptyInventory);
  const sampleRef=useRef<Inventory>(emptyInventory);
  const [demo,setDemoState]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState("");
  const [needsLogin,setNeedsLogin]=useState(false);
  const [userModalOpen,setUserModalOpen]=useState(false);
  const [waModalOpen,setWaModalOpen]=useState(false);
  const [view,setView]=useState<View>("dashboard"), [modal,setModal]=useState<Modal>(null), [detail,setDetail]=useState<Product|null>(null), [saleDetail,setSaleDetail]=useState<Sale|null>(null), [deleting,setDeleting]=useState<{product:Product;deleteStocks:boolean}|null>(null), [deleteBusy,setDeleteBusy]=useState(false);
  const [bulkDeleting, setBulkDeleting] = useState<{ ids: string[]; names: string[]; deleteStocks: boolean } | null>(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [deletingSale, setDeletingSale] = useState<{ sale: Sale; restoreStock: boolean } | null>(null);
  const [clearingSales, setClearingSales] = useState<{ restoreStock: boolean } | null>(null);
  const [saleDeleteBusy, setSaleDeleteBusy] = useState(false);
  const [initialFilter,setInitialFilter]=useState("all"), [chartDays,setChartDays]=useState("7"), [takeBusy,setTakeBusy]=useState(false);
  const loadSequence=useRef(0);
  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    const r=await requestJSON("/api/inventory",{cache:"no-store"});
    const d=r.body;
    if(r.status===401){
      if(sequence===loadSequence.current){
        setNeedsLogin(true);
        setError("");
      }
      return null;
    }
    if(!r.ok)throw new Error(d.error||"Data belum dapat dimuat.");
    if(sequence===loadSequence.current){
      setLive(d);
      setNeedsLogin(false);
      setError("");
    }
    return d as Inventory;
  },[]);
  useEffect(()=>{
    let active=true;
    const initialDemo=exampleInventory();
    sampleRef.current=initialDemo;
    setSample(initialDemo);
    load().then(d=>{
      if(active && d){
        let pref="";
        try{pref=localStorage.getItem("jstore-view-mode")||"";}catch{}
        let recovering=false;
        try{recovering=!!sessionStorage.getItem(pendingTakeKey);}catch{}
        setDemoState(!recovering && pref === "demo");
        if(recovering)setModal({kind:"sale"});
      }
    }).catch(e=>{
      if(active)setError(e.message);
    }).finally(()=>{
      if(active)setLoading(false);
    });
    return()=>{active=false;};
  },[load]);
  function switchMode(value:boolean){
    setDemoState(value);
    if(value){
      setError("");
      setNeedsLogin(false);
    }
    setDetail(null);
    setSaleDetail(null);
    setModal(null);
    setInitialFilter("all");
    try{localStorage.setItem("jstore-view-mode",value?"demo":"live");}catch{}
    if(!value)load().catch(e=>setError(e.message));
  }
  async function handleLogout(){
    try{
      await fetch("/api/auth/logout",{method:"POST"});
      toast.success("Berhasil keluar.");
    }catch{}
    try{localStorage.removeItem("jstore-view-mode");}catch{}
    setLive(emptyInventory);
    setDemoState(false);
    setNeedsLogin(true);
  }
  const data=demo?sample:live;
  const viewer=demo?{id:"demo-owner",name:"Owner contoh",role:"owner" as const}:live.viewer||{id:"",name:"Admin",role:"admin" as const},owner=viewer.role==="owner";
  const low=data.products.filter(p=>stockCount(data,p)<=p.minStock), ready=data.stocks.filter(isReady), todaySales=data.sales.filter(s=>localDay(s.createdAt)===today());
  const daily=summarizeSales(todaySales), revenue=daily.omzet, sold=daily.quantity, value=ready.reduce((a,s)=>a+(s.cost||0),0);
  const expiring=ready.filter(s=>s.expiresAt&&s.expiresAt<=new Date(Date.now()+3*86400000).toISOString().slice(0,10)).length;
  const mutate:Mutate=async payload=>{
    let out:MutationResult={};
    if(demo){
      const currentSample=sampleRef.current;
      const d:Inventory={products:[...currentSample.products],stocks:currentSample.stocks.map(s=>({...s})),sales:[...currentSample.sales],activities:[...currentSample.activities],claims:[...(currentSample.claims||[])]};
      const now=new Date().toISOString(), id=payload.id||generateUUID();
      const activity=(kind:string,message:string,quantity=0)=>d.activities.unshift({id:generateUUID(),kind,message,quantity,createdAt:now});
      if(payload.action==="product"){
        const p={id:payload.id||id,name:payload.name,category:payload.category,type:payload.type,duration:payload.duration,price:payload.price,cost:payload.cost,minStock:payload.minStock,resellerPrice:payload.resellerPrice,warrantyHours:payload.warrantyHours,createdAt:now} as Product;
        if(payload.id){const old=d.products.find(x=>x.id===p.id);if(old)p.createdAt=old.createdAt;d.products=d.products.map(x=>x.id===p.id?p:x);}else d.products.push(p);
        activity(payload.id?"edit":"product",`${productName(p)} · ${viewer.name||"Owner"}`);out={id:p.id};
      }else if(payload.action==="bulkProducts"){
        const list=(payload.products as any[])||[];
        let count = 0;
        for(const item of list){
          const pid = generateUUID();
          d.products.push({
            id: pid,
            name:item.name,
            category:item.category,
            type:item.type,
            duration:item.duration,
            price:item.price,
            cost:item.cost,
            minStock:item.minStock,
            resellerPrice:item.resellerPrice,
            warrantyHours:item.warrantyHours,
            createdAt:now
          });
          if(item.initialStock && Array.isArray(item.initialStock)){
            for(const line of item.initialStock){
              d.stocks.push({
                id: generateUUID(),
                productId: pid,
                value: line,
                cost: item.cost,
                state: "ready",
                createdAt: now,
              } as Stock);
              count++;
            }
          }
        }
        activity("product",`Impor massal: ${list.length} produk baru${count > 0 ? ` & ${count} stok` : ""} · ${viewer.name||"Owner"}`);
        out={inserted:list.length, stockInserted: count};
      }else if(payload.action==="restock"){
        const p=d.products.find(p=>p.id===payload.productId);
        if(!p)throw new Error("Produk tidak ditemukan.");
        if(payload.expiresAt && String(payload.expiresAt)<today())throw new Error("Tanggal kedaluwarsa sudah lewat.");
        const all=payload.lines as string[], lines=all;
        if(!all.length||all.length>500)throw new Error("Masukkan 1–500 baris stok.");
        d.stocks.unshift(...lines.map(v=>({id:generateUUID(),productId:p.id,value:v,cost:Number(payload.cost??p.cost),expiresAt:payload.expiresAt as string|null,state:"ready",saleId:null,createdAt:now})));
        if(lines.length)activity("restock",`${productName(p)} · ${viewer.name||"Owner"}`,lines.length);out={inserted:lines.length,duplicates:all.length-lines.length};
      }else if(payload.action==="sale"){
        const prior=d.sales.find(s=>s.id===payload.id);
        if(prior)return {id:prior.id,receipt:{sale:prior,stocks:d.stocks.filter(s=>s.saleId===prior.id)}};
        const p=d.products.find(p=>p.id===payload.productId);
        if(!p)throw new Error("Produk tidak ditemukan.");
        const qty=payload.quantity as number, replacement=payload.kind==="replacement";
        const items=d.stocks.filter(s=>s.productId===p.id&&isReady(s)).sort((a,b)=>(a.expiresAt||"9999").localeCompare(b.expiresAt||"9999")||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).slice(0,qty);
        if(items.length<qty)throw new InventoryMutationError("Stok siap jual tidak cukup.",409);
        const original=replacement?d.sales.find(s=>s.id===payload.originalSaleId):null;
        const sources=(payload.sourceStockIds||[]) as string[];
        if(replacement){
          if(!original||original.productId!==p.id||!payload.reference||sources.length!==qty||sources.length>25)throw new InventoryMutationError("Verifikasi pesanan asal dan akun garansi.",400);
          if((!original.warrantyUntil||original.warrantyUntil<now)&&payload.allowExpired!==1)throw new InventoryMutationError("Garansi berakhir atau belum diatur.",409);
          const valid=activeWarrantyStocks(d,original.id);
          if(new Set(sources).size!==qty||sources.some(id=>!valid.some(s=>s.id===id)))throw new InventoryMutationError("Akun sudah diganti atau bukan milik pesanan ini.",409);
          d.claims!.push(...sources.map((source,i)=>({id:generateUUID(),originalSaleId:original.id,originalStockId:source,replacementStockId:items[i].id,replacementSaleId:String(payload.id),reason:String(payload.reference),override:payload.allowExpired===1?1:0,createdAt:now})));
        }
        items.forEach(s=>{s.state=replacement?"replaced":"sold";s.saleId=payload.id as string;});
        const currentActorName=viewer.name||(owner?"Owner":"Admin");
        const sale:Sale={id:payload.id as string,productId:p.id,productName:productName(p),quantity:qty,total:replacement?0:qty*Number(payload.price??(payload.priceTier==="reseller"?p.resellerPrice:p.price)),cost:items.reduce((a,s)=>a+s.cost,0),customer:replacement?original!.customer:String(payload.customer||""),createdAt:now,kind:replacement?"replacement":"sale",actorId:viewer.id||"demo-actor",actorName:currentActorName,reference:String(payload.reference||""),originalSaleId:original?.id||null,warrantyUntil:replacement?original!.warrantyUntil:p.warrantyHours?new Date(Date.parse(now)+p.warrantyHours*3600000).toISOString():null};
        d.sales.unshift(sale);
        activity(replacement?"replacement":"sale",`${productName(p)} · ${currentActorName}`,qty);out={id:sale.id,receipt:{sale,stocks:items}};
      }else if(payload.action==="deleteProduct"){
        const p=d.products.find(p=>p.id===payload.id);
        if(!p)throw new Error("Produk tidak ditemukan.");
        if(payload.deleteStocks || payload.force){
          d.stocks=d.stocks.filter(s=>!(s.productId===payload.id && !s.saleId));
          d.products=d.products.filter(p=>p.id!==payload.id);
        }else{
          if(d.stocks.some(s=>s.productId===payload.id)||d.sales.some(s=>s.productId===payload.id))throw new Error("Produk yang memiliki stok atau riwayat penjualan tidak dapat dihapus.");
          d.products=d.products.filter(p=>p.id!==payload.id);
        }
        activity("delete",`${productName(p)} · ${viewer.name||"Owner"}`);
        out={ok:true};
      }else if(payload.action==="bulkDeleteProducts"){
        const ids=(payload.ids as string[])||[];
        const deleteStocks=!!payload.deleteStocks;
        if(deleteStocks){
          d.stocks=d.stocks.filter(s=>!(ids.includes(s.productId)&&!s.saleId));
          d.products=d.products.filter(p=>!ids.includes(p.id));
          activity("delete",`Hapus massal: ${ids.length} produk`);
          out={ok:true,deleted:ids.length,skipped:0};
        }else{
          const deletableIds=ids.filter(id=>!d.stocks.some(s=>s.productId===id)&&!d.sales.some(s=>s.productId===id));
          d.products=d.products.filter(p=>!deletableIds.includes(p.id));
          if(deletableIds.length)activity("delete",`Hapus massal: ${deletableIds.length} produk`);
          out={ok:true,deleted:deletableIds.length,skipped:ids.length-deletableIds.length};
        }
      }else if(payload.action==="stockState"){
        const s=d.stocks.find(s=>s.id===payload.id);if(!s)throw new Error("Stok tidak ditemukan.");if(s.saleId)throw new Error("Stok sudah diambil.");s.state=payload.state as string;
        const prod=d.products.find(p=>p.id===s.productId);
        activity(s.state==="invalid"?"invalid":"restore",prod?productName(prod):"Stok",1);
      }else if(payload.action==="deleteSale"){
        const sale=d.sales.find(s=>s.id===payload.id);
        if(!sale)throw new Error("Transaksi tidak ditemukan.");
        if(payload.restoreStock){
          d.stocks.forEach(s=>{if(s.saleId===payload.id){s.state="ready";s.saleId=null;}});
        }else{
          d.stocks=d.stocks.filter(s=>s.saleId!==payload.id);
        }
        if(d.claims){
          d.claims=d.claims.filter(c=>c.originalSaleId!==payload.id && c.replacementSaleId!==payload.id);
        }
        d.sales=d.sales.filter(s=>s.id!==payload.id);
        activity("delete",`Hapus transaksi #${sale.id.slice(0,8)} (${sale.productName}) · ${viewer.name||"Owner"}`,sale.quantity);
        out={ok:true,deleted:1};
      }else if(payload.action==="clearSalesHistory"){
        if(payload.restoreStock){
          d.stocks.forEach(s=>{if(s.saleId){s.state="ready";s.saleId=null;}});
        }else{
          d.stocks=d.stocks.filter(s=>!s.saleId);
        }
        d.claims=[];
        d.sales=[];
        activity("delete",`Reset seluruh riwayat penjualan · ${viewer.name||"Owner"}`);
        out={ok:true};
      }
      sampleRef.current=d;
      setSample(d);
    }else{
      const r=await requestJSON("/api/inventory",{method:"POST",headers:{"Content-Type":"application/json","x-jstore-request":"1"},body:JSON.stringify(payload)});
      const result=r.body;if(!r.ok){if(r.status===409){try{await load();}catch{}}throw new InventoryMutationError(result.error||"Perubahan belum dapat disimpan.",r.status);}out=result;
      if(out.receipt){
        const receipt=out.receipt,allocatedById=new Map(receipt.stocks.map(s=>[s.id,s]));
        setLive(current=>({...current,sales:[receipt.sale,...current.sales.filter(s=>s.id!==receipt.sale.id)],stocks:current.stocks.map(s=>{const allocated=allocatedById.get(s.id);if(!allocated)return s;const {value:secret,...metadata}=allocated;return {...s,...metadata};})}));
        void load().catch(()=>setError("Pengambilan tersimpan. Muat ulang untuk menyegarkan riwayat."));
      }else{
        try{await load();}catch{setError("Perubahan tersimpan, tetapi tampilan belum diperbarui. Klik muat ulang.");}
      }
    }
    return out;
  };
  function openWarranty(sale:Sale){const root=data.sales.find(s=>s.id===(sale.originalSaleId||sale.id))||sale;setSaleDetail(null);setModal({kind:"sale",initialWarranty:root.id,product:data.products.find(p=>p.id===root.productId)});}
  function openModal(kind:"product"|"restock"|"sale",product?:Product){
    if(kind==="product"&&!owner){toast.info("Produk dan harga diatur oleh owner.");return;}
    if(kind!=="product"&&!data.products.length){if(!owner){toast.info("Minta owner menambahkan produk terlebih dahulu.");return;}setModal({kind:"product"});toast.info("Tambahkan produk pertama sebelum memasukkan stok.");return;}
    setModal({kind,product});
  }
  async function deleteProduct(){
    if(!deleting)return;
    setDeleteBusy(true);
    try{
      await mutate({action:"deleteProduct",id:deleting.product.id,deleteStocks:deleting.deleteStocks,force:true});
      toast.success(demo?"Produk contoh dihapus":"Produk berhasil dihapus");
      if(detail?.id===deleting.product.id)setDetail(null);
      setDeleting(null);
    }catch(e){
      toast.error((e as Error).message);
    }finally{
      setDeleteBusy(false);
    }
  }
  async function handleBulkDelete(){
    if(!bulkDeleting||!bulkDeleting.ids.length)return;
    setBulkDeleteBusy(true);
    try{
      const res=await mutate({action:"bulkDeleteProducts",ids:bulkDeleting.ids,deleteStocks:bulkDeleting.deleteStocks});
      if(res.deleted&&res.deleted>0){
        toast.success(demo?`Simulasi: ${res.deleted} produk dihapus.`:`Berhasil menghapus ${res.deleted} produk.`);
      }else{
        toast.warning("Tidak ada produk yang dapat dihapus.");
      }
      setBulkDeleting(null);
    }catch(e){
      toast.error((e as Error).message);
    }finally{
      setBulkDeleteBusy(false);
    }
  }
  async function handleDeleteSale(){
    if(!deletingSale)return;
    setSaleDeleteBusy(true);
    try{
      await mutate({action:"deleteSale",id:deletingSale.sale.id,restoreStock:deletingSale.restoreStock});
      toast.success(demo?"Simulasi: Transaksi dihapus":"Riwayat transaksi berhasil dihapus");
      if(saleDetail?.id===deletingSale.sale.id)setSaleDetail(null);
      setDeletingSale(null);
    }catch(e){
      toast.error((e as Error).message);
    }finally{
      setSaleDeleteBusy(false);
    }
  }
  async function handleClearSales(){
    if(!clearingSales)return;
    setSaleDeleteBusy(true);
    try{
      await mutate({action:"clearSalesHistory",restoreStock:clearingSales.restoreStock});
      toast.success(demo?"Simulasi: Seluruh riwayat penjualan direset":"Seluruh riwayat penjualan berhasil dibersihkan");
      setSaleDetail(null);
      setClearingSales(null);
    }catch(e){
      toast.error((e as Error).message);
    }finally{
      setSaleDeleteBusy(false);
    }
  }
  function exportReport(){
    const rows=view==="sales"?[
      ["Tanggal (WIB)","ID transaksi","Jenis","Produk","Pelanggan","Referensi","Admin","Jumlah","Omzet",...(owner?["Modal","Laba kotor","Biaya penggantian"]:[])],
      ...data.sales.map(s=>[formatDate(s.createdAt,true),s.id,s.kind==="replacement"?"Garansi":"Penjualan",s.productName,s.customer,s.reference||"",s.actorName||"",s.quantity,s.kind==="replacement"?0:s.total,...(owner?[s.cost,s.kind==="replacement"?0:s.total-s.cost,s.kind==="replacement"?s.cost:0]:[])])
    ]:[
      ["Produk","Varian","Kategori","Jenis","Stok siap jual","Harga reguler","Harga reseller","Garansi (jam)",...(owner?["Modal default"]:[])],
      ...data.products.map(p=>[p.name,p.duration,p.category,typeLabels[p.type],stockCount(data,p),p.price,p.resellerPrice??"",p.warrantyHours||0,...(owner?[p.cost]:[])])
    ];
    const csv=rows.map(row=>row.map(v=>{let s=String(v??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(",")).join("\r\n");
    downloadFile(`jstore-${demo?"contoh-":""}${view==="sales"?"penjualan":"stok"}-${today()}.csv`,"\uFEFF"+csv,"text/csv;charset=utf-8");toast.success("Laporan berhasil diunduh");
  }
  const currentTitle={dashboard:"Ringkasan toko",products:"Produk & stok",sales:"Penjualan",warranty:"Garansi pelanggan",activity:"Riwayat aktivitas"}[view];
  const refreshed=()=>{setLoading(true);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));};

  if(!demo && needsLogin){
    return (
      <>
        <LoginView
          onLoginSuccess={user=>{
            try{localStorage.setItem("jstore-view-mode","live");}catch{}
            setLive(prev => ({ ...prev, viewer: user }));
            setDemoState(false);
            setNeedsLogin(false);
            setLoading(true);
            load().finally(()=>setLoading(false));
          }}
          onEnterDemo={()=>switchMode(true)}
        />
        <Toaster theme="light" position="bottom-right" richColors/>
      </>
    );
  }

  return <OperatorContext.Provider value={viewer}><SidebarProvider style={{"--sidebar-width":"238px"} as CSSProperties}><AppSidebar view={view} setView={v=>{setView(v);setInitialFilter("all");}} low={low.length} demo={demo} setDemo={switchMode} onLogout={demo?()=>switchMode(false):handleLogout} onOpenUserModal={()=>setUserModalOpen(true)} onOpenWaTemplateModal={()=>setWaModalOpen(true)}/><SidebarInset className="min-w-0"><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger className="md:hidden" aria-label="Buka menu"/><div className="breadcrumb"><Store size={14}/><span>Workspace</span><ChevronRight size={12}/><b>{navItems.find(n=>n.id===view)?.label}</b></div></div><div className="topbar-right"><span className="private-tag"><ShieldCheck size={13}/>{owner?"Owner":viewer.name||"Admin"}</span>{owner&&<><button className="user-menu-btn" title="Atur Template Pesan WhatsApp Toko" onClick={()=>setWaModalOpen(true)}><MessageSquare size={13}/><span>Template WA</span></button><button className="user-menu-btn" title="Kelola Admin & Password Owner" onClick={()=>setUserModalOpen(true)}><KeyRound size={13}/><span>Akun & Admin</span></button></>}<button className="icon-btn" title="Lihat stok yang perlu perhatian" aria-label="Lihat stok yang perlu perhatian" onClick={()=>{setView("products");setInitialFilter("low");}}><Bell/>{low.length>0&&<i className="notify-count"/>}</button><div className="h-5 border-l border-[#e9eaed]"/><button className="user-menu-btn" title="Keluar / Ganti Akun" onClick={demo?()=>switchMode(false):handleLogout}><LogOut size={13}/><span>Keluar</span></button></div></header><div className="main-content"><div className="page-heading"><div><div className="eyebrow">{view==="dashboard"?"WORKSPACE JSTORE DIGITAL":"JSTORE DIGITAL"}</div><h1>{currentTitle}</h1><p>{view==="dashboard"?"Semua stok dan aktivitas tokomu, dalam satu tempat.":view==="products"?"Kelola produk, akun, dan link siap jual.":view==="sales"?"Pengambilan akun, harga jual, dan admin tercatat otomatis.":view==="warranty"?"Penggantian akun terhubung dengan pesanan asal.":"Jejak setiap perubahan stok dan transaksi toko."}</p></div><div className="heading-actions"><button className="icon-btn" title="Muat ulang data toko" aria-label="Muat ulang data toko" onClick={refreshed} disabled={loading}><RefreshCw/></button>{(view==="products"||view==="sales"||view==="dashboard")&&<button className="btn export-btn" onClick={exportReport} disabled={loading}><Download/><span className="export-label">Ekspor</span></button>}{view!=="activity"&&<>{view!=="sales"&&view!=="warranty"&&<button className="btn" onClick={()=>openModal(view==="products"&&owner?"product":"restock")} disabled={loading}><Plus/>{view==="products"&&owner?"Tambah produk":"Tambah stok"}</button>}<button className="btn btn-primary" onClick={()=>openModal("sale")} disabled={loading}><ShoppingBag/>Ambil stok</button></>}</div></div>
    {demo&&<div className="demo-banner"><span><Beaker/><strong>Mode contoh</strong><span className="demo-explainer">Data simulasi · perubahan tidak disimpan</span></span><button onClick={()=>switchMode(false)}>Mulai kelola toko <ArrowRight/></button></div>}
    {error&&<div className="demo-banner error-banner" role="alert"><span><CircleAlert/>{error}</span><button onClick={refreshed}>Muat ulang <RefreshCw/></button></div>}
    {loading?<div className="metric-grid">{[1,2,3,4].map(i=><Skeleton key={i} className="h-36 rounded-xl"/>)}</div>:<>
    {view==="dashboard"&&<><section className="metric-grid" aria-label="Statistik toko"><Metric label="Stok siap jual" value={num(ready.length)} unit="unit" icon={<Boxes/>} note={<><span className="text-green">{data.products.filter(p=>stockCount(data,p)>0).length} produk</span> tersedia untuk dijual</>}/><Metric label="Terjual hari ini" value={num(sold)} unit="unit" icon={<ShoppingBag/>} note={<><CalendarDays/>{daily.transactions} transaksi hari ini</>}/><Metric label="Omzet hari ini" value={money(revenue)} icon={<Wallet/>} note="Otomatis dari pengambilan penjualan"/>{owner?<Metric label="Laba kotor hari ini" value={money(daily.grossProfit)} icon={<TrendingUp/>} note="Omzet dikurangi modal akun terjual"/>:<Metric label="Penggantian hari ini" value={num(todaySales.filter(s=>s.kind==="replacement").reduce((a,s)=>a+s.quantity,0))} unit="unit" icon={<ShieldCheck/>} note="Garansi tercatat terpisah"/>}</section>{owner&&<div className="guarantee-summary"><span>Biaya penggantian hari ini <strong>{money(daily.replacementCost)}</strong></span><span>Hasil setelah penggantian <strong>{money(daily.afterReplacement)}</strong></span><span>Belum dikurangi biaya operasional</span></div>}
    <section className="overview-grid"><SalesChart sales={data.sales.filter(s=>s.kind!=="replacement")} days={chartDays} setDays={setChartDays}/><div className="panel attention-panel"><div className="panel-heading"><h2>Perlu perhatian</h2><span className="attention-count">{low.length} produk</span></div>{low.length?low.slice(0,3).map(p=><div className="attention-item" key={p.id}><ProductSymbol product={p}/><div className="product-info"><strong>{p.name}</strong><small>{p.duration} · {stockCount(data,p)===0?"Stok habis":`Tersisa ${stockCount(data,p)} unit`}</small></div><button className="restock-link" onClick={()=>openModal("restock",p)}>Restock <Plus size={12}/></button></div>):<Blank title="Stok terkendali" description={data.products.length?"Semua stok berada di atas batas minimum.":"Tambahkan produk untuk mulai memantau stok."}/>}<div className="expiry-note"><Timer/>{expiring>0?`${expiring} stok kedaluwarsa dalam 3 hari` : "Belum ada stok mendekati kedaluwarsa"}</div></div></section>
    <section className="lower-grid"><ProductTable data={data} compact openProduct={setDetail} openModal={openModal} onDelete={p=>setDeleting({product:p,deleteStocks:true})} onBulkDelete={items=>setBulkDeleting({ids:items.map(p=>p.id),names:items.map(p=>p.name),deleteStocks:true})} onShowAll={()=>{setView("products");setInitialFilter("all");}}/><div className="panel activity-panel"><div className="panel-heading"><h2>Aktivitas terbaru</h2><button className="link-btn" onClick={()=>setView("activity")}>Lihat semua <ArrowUpRight/></button></div><ActivityList items={data.activities.slice(0,5)}/><div className="activity-footer"><RefreshCw/>{demo?"Aktivitas simulasi untuk mencoba toko":"Diperbarui setelah setiap perubahan"}</div></div></section></>}
    {view==="products"&&<><section className="metric-grid"><Metric label="Total produk" value={num(data.products.length)} unit="produk" icon={<Package/>} note="Semua kategori produk"/><Metric label="Stok siap jual" value={num(ready.length)} unit="unit" icon={<Boxes/>} note="Stok aktif, belum kedaluwarsa"/>{owner?<Metric label="Nilai modal stok" value={money(value)} icon={<Wallet/>} note="Total modal stok siap jual"/>:<Metric label="Perlu restock" value={num(low.length)} unit="produk" icon={<CircleAlert/>} note="Stok habis atau menipis"/>}<Metric label="Kedaluwarsa" value={num(data.stocks.filter(s=>s.state==="ready"&&isExpired(s)).length)} unit="unit" icon={<Timer/>} note="Otomatis dikecualikan dari penjualan"/></section><ProductTable key={initialFilter+String(demo)} data={data} initialFilter={initialFilter} openProduct={setDetail} openModal={openModal} onDelete={p=>setDeleting({product:p,deleteStocks:true})} onBulkDelete={items=>setBulkDeleting({ids:items.map(p=>p.id),names:items.map(p=>p.name),deleteStocks:true})}/></>}
    {view==="sales"&&<SalesView data={data} onDetail={setSaleDetail} onAdd={()=>openModal("sale")} onDeleteSale={s=>setDeletingSale({sale:s,restoreStock:true})} onClearSales={()=>setClearingSales({restoreStock:false})}/>}
    {view==="warranty"&&<WarrantyDesk data={data} onProcess={openWarranty} onDetail={setSaleDetail}/>}
    {view==="activity"&&<div className="panel activity-full"><div className="panel-heading" style={{paddingBottom:18}}><div><h2>Aktivitas toko</h2><p>Maksimal 200 perubahan terbaru · waktu WIB</p></div><History size={18} className="text-[#9da2aa]"/></div><ActivityList items={data.activities}/></div>}
    </>}
    <footer className="page-footer"><span>© {new Date().getFullYear()} JStore Digital</span><span>Every Digital, In One Store.</span></footer></div></SidebarInset><Toaster theme="light" position="bottom-right" richColors/>
    <Dialog open={!!modal} onOpenChange={open=>{if(!open&&!takeBusy)setModal(null);}}><DialogContent className="modal-content" showCloseButton={!takeBusy}>{modal&&<><DialogHeader><DialogTitle>{modal.kind==="product"?(modal.product?"Edit produk":"Tambah produk"):modal.kind==="restock"?"Tambah stok":"Ambil stok cepat"}</DialogTitle><DialogDescription>{modal.kind==="product"?"Atur produk dan harga jual untuk tokomu.":modal.kind==="restock"?"Tempel pesan supplier atau unggah stok sekaligus.":"Pilih produk dan jumlah. Stok serta laporan langsung diperbarui."}</DialogDescription></DialogHeader>{demo&&<div className="form-info">Mode contoh — perubahan hanya untuk simulasi dan tidak disimpan.</div>}{modal.kind==="product"?<ProductForm key={modal.product?.id||"new"} product={modal.product} mutate={mutate} close={()=>setModal(null)}/>:modal.kind==="restock"?<RestockForm data={data} product={modal.product} mutate={mutate} close={()=>setModal(null)}/>:<QuickTakeForm data={data} product={modal.product} initialWarranty={modal.initialWarranty} demo={demo} mutate={mutate} close={()=>setModal(null)} onLock={setTakeBusy}/>}</>}</DialogContent></Dialog>
    <StockDetail product={detail?data.products.find(p=>p.id===detail.id)||detail:null} data={data} demo={demo} close={()=>setDetail(null)} mutate={mutate} openModal={openModal} onDelete={p=>setDeleting({product:p,deleteStocks:true})}/>
    <SaleDetails sale={saleDetail?data.sales.find(s=>s.id===saleDetail.id)||saleDetail:null} data={data} demo={demo} close={()=>setSaleDetail(null)} onWarranty={openWarranty} onShowSale={setSaleDetail} onDeleteSale={s=>setDeletingSale({sale:s,restoreStock:true})}/>
    <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!deleteBusy)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus produk ini?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p>Produk <strong>{deleting&&productName(deleting.product)}</strong> akan dihapus dari daftar produk.</p>{deleting&&stockCount(data,deleting.product)>0&&<label className="flex items-center gap-2 text-xs text-[#333] cursor-pointer pt-1"><input type="checkbox" checked={deleting.deleteStocks} onChange={e=>setDeleting(d=>d?{...d,deleteStocks:e.target.checked}:null)} className="rounded border-[#d0cdc4] accent-[#d93838]"/><span>Hapus juga {stockCount(data,deleting.product)} sisa stok siap jual pada produk ini</span></label>}<p className="text-[11px] text-[#8e939d]">Catatan: Riwayat transaksi penjualan terdahulu (jika ada) tetap tersimpan aman di pembukuan toko.</p></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>Batal</AlertDialogCancel><button className="btn btn-danger" disabled={deleteBusy} onClick={deleteProduct}>{deleteBusy?<Loader2 className="animate-spin"/>:<Trash2/>}Hapus produk</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!bulkDeleting} onOpenChange={open=>{if(!open&&!bulkDeleteBusy)setBulkDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus {bulkDeleting?.ids.length} produk terpilih?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p>Produk berikut akan dihapus:</p><div className="max-h-28 overflow-y-auto rounded bg-[#f7f6f2] p-2 text-xs text-[#555962] font-mono leading-relaxed">{bulkDeleting?.names.join(", ")}</div><label className="flex items-center gap-2 text-xs text-[#333] cursor-pointer pt-1"><input type="checkbox" checked={bulkDeleting?.deleteStocks ?? true} onChange={e=>setBulkDeleting(b=>b?{...b,deleteStocks:e.target.checked}:null)} className="rounded border-[#d0cdc4] accent-[#d93838]"/><span>Hapus juga sisa stok siap jual yang ada di produk ini</span></label><p className="text-[11px] text-[#8e939d]">Catatan: Produk yang pernah memiliki riwayat transaksi penjualan akan tetap disimpan demi keutuhan data pembukuan toko.</p></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={bulkDeleteBusy}>Batal</AlertDialogCancel><button className="btn btn-danger" disabled={bulkDeleteBusy} onClick={handleBulkDelete}>{bulkDeleteBusy?<Loader2 className="animate-spin"/>:<Trash2/>}Hapus {bulkDeleting?.ids.length} Produk</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deletingSale} onOpenChange={open=>{if(!open&&!saleDeleteBusy)setDeletingSale(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus riwayat transaksi #{deletingSale?.sale.id.replace("demo-sale-","CONTOH-").slice(0,10).toUpperCase()}?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p>Transaksi untuk produk <strong>{deletingSale?.sale.productName}</strong> ({deletingSale?.sale.quantity} unit) akan dihapus dari riwayat penjualan.</p><label className="flex items-center gap-2 text-xs text-[#333] cursor-pointer pt-1"><input type="checkbox" checked={deletingSale?.restoreStock ?? true} onChange={e=>setDeletingSale(s=>s?{...s,restoreStock:e.target.checked}:null)} className="rounded border-[#d0cdc4] accent-[#d93838]"/><span>Kembalikan {deletingSale?.sale.quantity} stok akun ke status <strong>Siap Jual</strong></span></label><p className="text-[11px] text-[#8e939d]">Jika centang dilepas, data akun/stok yang pernah terjual pada transaksi ini akan dihapus permanen dari sistem.</p></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saleDeleteBusy}>Batal</AlertDialogCancel><button className="btn btn-danger" disabled={saleDeleteBusy} onClick={handleDeleteSale}>{saleDeleteBusy?<Loader2 className="animate-spin"/>:<Trash2/>}Hapus Transaksi</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!clearingSales} onOpenChange={open=>{if(!open&&!saleDeleteBusy)setClearingSales(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset Seluruh Riwayat Penjualan?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p className="text-red-600 font-medium">Peringatan: Seluruh data riwayat transaksi penjualan dan klaim garansi akan dibersihkan.</p><label className="flex items-center gap-2 text-xs text-[#333] cursor-pointer pt-1"><input type="checkbox" checked={clearingSales?.restoreStock ?? false} onChange={e=>setClearingSales(c=>c?{...c,restoreStock:e.target.checked}:null)} className="rounded border-[#d0cdc4] accent-[#d93838]"/><span>Kembalikan semua akun/stok yang pernah terjual menjadi <strong>Siap Jual</strong></span></label><p className="text-[11px] text-[#8e939d]">Jika tidak dicentang, akun/stok yang sudah terlanjur terjual akan dihapus permanen, dan hanya stok yang belum pernah terjual yang tetap ada.</p></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saleDeleteBusy}>Batal</AlertDialogCancel><button className="btn btn-danger" disabled={saleDeleteBusy} onClick={handleClearSales}>{saleDeleteBusy?<Loader2 className="animate-spin"/>:<Trash2/>}Reset Seluruh Riwayat</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <UserManagementModal open={userModalOpen} onOpenChange={setUserModalOpen} demo={demo} />
    <WaTemplateModal open={waModalOpen} onOpenChange={setWaModalOpen} currentTemplate={live.defaultWaTemplate || sample.defaultWaTemplate || ""} onSaved={tpl => { setLive(prev => ({ ...prev, defaultWaTemplate: tpl })); setSample(prev => ({ ...prev, defaultWaTemplate: tpl })); }} demo={demo} />
  </SidebarProvider></OperatorContext.Provider>;
}

function Metric({label,value,unit,icon,note}:{label:string;value:string;unit?:string;icon:ReactNode;note:ReactNode}){return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}{unit&&<small>{unit}</small>}</div><div className="metric-caption">{note}</div></article>;}
function SalesChart({sales,days,setDays}:{sales:Sale[];days:string;setDays:(s:string)=>void}){
  const series=useMemo(()=>Array.from({length:Number(days)},(_,i)=>{const date=new Date(Date.now()-(Number(days)-1-i)*86400000),key=localDay(date.toISOString());return {date:key,label:new Intl.DateTimeFormat("id-ID",Number(days)===7?{weekday:"short",timeZone:"Asia/Jakarta"}:{day:"numeric",month:"short",timeZone:"Asia/Jakarta"}).format(date),total:sales.filter(s=>localDay(s.createdAt)===key).reduce((a,s)=>a+s.total,0)};}),[sales,days]);
  return <div className="panel"><div className="panel-heading"><div><h2>Ringkasan penjualan</h2><p>Penjualan harian dalam rupiah</p></div><Choice className="small-select" label="Periode grafik" value={days} onChange={setDays} options={[{value:"7",label:"7 hari terakhir"},{value:"30",label:"30 hari terakhir"}]}/></div><div className="chart-summary"><strong>{money(series.reduce((a,s)=>a+s.total,0))}</strong><span>total {days} hari</span><div className="chart-legend ml-auto"><i/>Penjualan</div></div><div className="sales-chart" role="img" aria-label={`Grafik penjualan ${days} hari, total ${money(series.reduce((a,s)=>a+s.total,0))}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{top:9,right:18,left:0,bottom:0}}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ed813e" stopOpacity={.18}/><stop offset="100%" stopColor="#ed813e" stopOpacity={.015}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#eceef1" strokeDasharray="3 4"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#a0a5ae",fontSize:12}} tickMargin={12} minTickGap={20}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#a0a5ae",fontSize:11}} width={56} tickFormatter={n=>n>=1000000?`${n/1000000}jt`:n>=1000?`${n/1000}rb`:String(n)} tickCount={4} domain={[0,"auto"]}/><ChartTooltip formatter={v=>[money(Number(v)),"Penjualan"]} labelStyle={{fontSize:12,color:"#979b9f"}} contentStyle={{border:"1px solid #ede9e3",borderRadius:9,fontSize:13}}/><Area type="monotone" dataKey="total" stroke="#e77b41" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{r:5,stroke:"#fff",strokeWidth:2}} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></div>;
}

function ProductTable({data,compact=false,initialFilter="all",openProduct,openModal,onDelete,onBulkDelete,onShowAll}:{data:Inventory;compact?:boolean;initialFilter?:string;openProduct:(p:Product)=>void;openModal:(k:"product"|"restock"|"sale",p?:Product)=>void;onDelete:(p:Product)=>void;onBulkDelete?:(products:Product[])=>void;onShowAll?:()=>void}){
  const owner=useOperator().role==="owner";
  const [search,setSearch]=useState(""),[category,setCategory]=useState("all"),[filter,setFilter]=useState(initialFilter),[page,setPage]=useState(1);
  const [selected,setSelected]=useState<string[]>([]);
  const filtered=data.products.filter(p=>{const q=stockCount(data,p);return `${p.name} ${p.duration} ${p.category}`.toLowerCase().includes(search.toLowerCase())&&(category==="all"||p.category===category)&&(filter==="all"||(filter==="low"&&q<=p.minStock)||(filter==="ready"&&q>0)||(filter==="expired"&&data.stocks.some(s=>s.productId===p.id&&s.state==="ready"&&isExpired(s))));});
  const pageSize=compact?5:10, pages=Math.max(1,Math.ceil(filtered.length/pageSize)), current=Math.min(page,pages), rows=filtered.slice((current-1)*pageSize,current*pageSize);
  const isAllPageSelected = rows.length > 0 && rows.every(r => selected.includes(r.id));

  function toggleSelectAll(){
    if(isAllPageSelected){
      setSelected(prev => prev.filter(id => !rows.some(r => r.id === id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...rows.map(r => r.id)])]);
    }
  }

  function toggleSelect(id: string){
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const selectedProducts = data.products.filter(p => selected.includes(p.id));

  return <div className="panel product-panel"><div className="panel-heading"><div><h2>{compact?"Stok produk":"Daftar produk"} <span className="ml-1 rounded bg-[#f5f5f7] px-1.5 py-0.5 text-xs font-normal text-[#969aa2]">{data.products.length}</span></h2></div>{compact?<button className="link-btn" onClick={onShowAll}>Lihat semua <ArrowUpRight/></button>:<div className="flex items-center gap-2"><button className="link-btn" onClick={()=>openModal("restock")}><Upload/>Impor stok</button></div>}</div>
    {owner && !compact && selected.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 mx-4 mb-3 rounded-lg bg-[#fff6f6] border border-[#fed6d6] text-xs animate-in fade-in duration-200">
        <span className="font-semibold text-[#b82e2e] flex items-center gap-1.5">
          <Trash2 size={14}/> {selected.length} produk dipilih
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-small bg-[#d93838] text-white hover:bg-[#bd2828] border-none font-medium"
            onClick={() => onBulkDelete?.(selectedProducts)}
          >
            <Trash2 size={13}/> Hapus {selected.length} Produk
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setSelected([])}
          >
            Batal
          </button>
        </div>
      </div>
    )}
    <div className="table-toolbar"><div className="searchbox"><Search/><input aria-label="Cari produk" placeholder="Cari nama produk..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div><div className="filters"><Choice label="Kategori produk" value={category} onChange={s=>{setCategory(s);setPage(1);}} options={[{value:"all",label:"Semua kategori"},...categories.map(s=>({value:s,label:s}))]}/>{!compact&&<Choice label="Status stok" value={filter} onChange={s=>{setFilter(s);setPage(1);}} options={[{value:"all",label:"Semua status"},{value:"ready",label:"Siap jual"},{value:"low",label:"Perlu restock"},{value:"expired",label:"Kedaluwarsa"}]}/>}</div></div>{!rows.length?<Blank title={data.products.length?"Produk tidak ditemukan":"Belum ada produk"} description={data.products.length?"Coba nama lain atau ubah filter pencarian.":"Buat produk pertama untuk mulai mengelola stok."}>{!data.products.length&&owner&&<div className="flex flex-wrap justify-center gap-2"><button className="btn btn-primary" onClick={()=>openModal("product")}><Plus/>Tambah produk</button></div>}</Blank>:<div className="stock-table-wrap"><Table className="product-table"><TableHeader><TableRow>{owner&&!compact&&<TableHead className="w-8"><input type="checkbox" checked={isAllPageSelected} onChange={toggleSelectAll} className="rounded border-[#d0cdc4] accent-[#d93838] cursor-pointer"/></TableHead>}<TableHead>Nama produk</TableHead>{!compact&&<TableHead className="category-column">Kategori</TableHead>}<TableHead>Harga jual</TableHead><TableHead>Stok</TableHead><TableHead>Status</TableHead><TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(p=>{const qty=stockCount(data,p);return <TableRow key={p.id} className={selected.includes(p.id)?"bg-[#fdf8f8]":""}>{owner&&!compact&&<TableCell className="w-8"><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggleSelect(p.id)} className="rounded border-[#d0cdc4] accent-[#d93838] cursor-pointer"/></TableCell>}<TableCell><button className="product-cell text-left" onClick={()=>openProduct(p)}><ProductSymbol product={p}/><div className="product-info"><strong>{p.name}</strong><small>{p.duration} · {typeLabels[p.type]}</small></div></button></TableCell>{!compact&&<TableCell className="category-column text-[#8a909a]">{p.category}</TableCell>}<TableCell className="text-[#666d77]">{money(p.price)}</TableCell><TableCell><span className={`stock-number ${qty<=p.minStock?"text-orange":""}`}>{num(qty)}<small>unit</small></span></TableCell><TableCell><StatusBadge quantity={qty} min={p.minStock}/></TableCell><TableCell className="text-right"><div className="take-row-actions"><button className="btn btn-small" disabled={qty===0} onClick={()=>openModal("sale",p)}>Ambil</button><DropdownMenu><DropdownMenuTrigger className="icon-btn" aria-label={`Aksi ${productName(p)}`}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>openProduct(p)}><Eye/>Lihat stok</DropdownMenuItem><DropdownMenuItem onClick={()=>openModal("restock",p)}><Plus/>Tambah stok</DropdownMenuItem><DropdownMenuItem onClick={()=>openModal("sale",p)} disabled={qty===0}><ShoppingBag/>Ambil & catat terjual</DropdownMenuItem>{owner&&<><DropdownMenuItem onClick={()=>openModal("product",p)}><Pencil/>Edit produk</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-red-600" onClick={()=>onDelete(p)}><Trash2/>Hapus produk</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>;})}</TableBody></Table></div>}<div className="table-footer"><span>Menampilkan {rows.length?(current-1)*pageSize+1:0}–{Math.min(current*pageSize,filtered.length)} dari {filtered.length} produk</span><div className="pagination-controls"><button aria-label="Halaman sebelumnya" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={13}/></button><span>{current}</span><button aria-label="Halaman berikutnya" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={13}/></button></div></div></div>;
}
function ActivityList({items}:{items:Activity[]}){const labels:Record<string,string>={sale:"Stok terjual",replacement:"Penggantian garansi",restock:"Stok ditambahkan",product:"Produk baru",edit:"Produk diperbarui",delete:"Produk dihapus",invalid:"Stok ditandai bermasalah",restore:"Stok diaktifkan kembali"};return items.length?<div className="activity-list">{items.map(a=><div className="activity-row" key={a.id}><span className={`activity-icon ${a.kind==="sale"?"sale":""}`}>{a.kind==="sale"?<ArrowUpRight/>:a.kind==="restock"?<ArrowDownLeft/>:<Package/>}</span><div className="activity-text"><strong>{labels[a.kind]||a.kind}</strong><p>{a.message}</p></div><div className="activity-meta">{a.quantity>0&&<b className={a.kind==="sale"?"sale":""}>{(a.kind==="sale"||a.kind==="replacement")?"−":a.kind==="restock"?"+":""}{a.quantity} unit</b>}{formatDate(a.createdAt,true)}</div></div>)}</div>:<Blank title="Belum ada aktivitas" description="Perubahan produk, stok, dan penjualan akan tercatat di sini."/>;}

function ProductForm({product,mutate,close}:{product?:Product;mutate:Mutate;close:()=>void}){
  const [category,setCategory]=useState(product?.category||categories[0]),[type,setType]=useState(product?.type||"account"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [initialStock,setInitialStock]=useState("");
  const [customWa,setCustomWa]=useState(!!product?.waTemplate);
  const [waTemplate,setWaTemplate]=useState(product?.waTemplate||"");
  const [showPreview,setShowPreview]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError("");
    try{
      const payload: any = {
        action: "product",
        name: String(f.get("name")).trim(),
        duration: String(f.get("duration")).trim(),
        category,
        type,
        price: Number(f.get("price")),
        cost: Number(f.get("cost")),
        minStock: Number(f.get("minStock")),
        resellerPrice: String(f.get("resellerPrice")||"").trim() ? Number(f.get("resellerPrice")) : null,
        warrantyHours: Number(f.get("warrantyHours")),
        waTemplate: customWa && waTemplate.trim() ? waTemplate.trim() : null,
      };
      if(product){
        payload.id = product.id;
      }
      const res = await mutate(payload);
      const pid = product?.id || res?.id;
      if(!product && pid && initialStock.trim()){
        const lines = initialStock
          .split(/\r?\n/)
          .map(l => l.trim().replace(/^\s*\d+[\.\)\-:\s]\s*/, "").replace(/^(?:[-•*]\s+)/, "").trim())
          .filter(Boolean);
        if(lines.length){
          await mutate({action:"restock",productId:pid,lines,cost:Number(f.get("cost")),expiresAt:null,reference:"Stok awal saat buat produk"});
        }
      }
      toast.success(product?"Produk berhasil diperbarui":"Produk & stok awal berhasil disimpan");
      close();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const detectedInitialCount = initialStock
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^\s*\d+[\.\)\-:\s]\s*/, "").replace(/^(?:[-•*]\s+)/, "").trim())
    .filter(Boolean).length;
  return <form onSubmit={submit} className="form-stack"><label className="field">Nama produk<input name="name" required maxLength={100} placeholder="Contoh: CapCut Pro" defaultValue={product?.name} autoFocus/></label><div className="form-row"><label className="field">Kategori<Choice label="Kategori" value={category} onChange={setCategory} options={categories.map(s=>({value:s,label:s}))}/></label><label className="field">Jenis stok<Choice label="Jenis stok" value={type} onChange={setType} options={Object.entries(typeLabels).map(([value,label])=>({value,label}))}/></label></div><label className="field">Varian / durasi<input name="duration" required maxLength={80} placeholder="Contoh: 7 hari / Private" defaultValue={product?.duration}/></label><div className="form-row"><label className="field">Harga jual per unit (Rp)<input name="price" type="number" required min={0} max={1000000000} step={1} defaultValue={product?.price} placeholder="2000"/></label><label className="field">Modal per unit (Rp)<input name="cost" type="number" required min={0} max={1000000000} step={1} defaultValue={product?.cost} placeholder="1200"/></label></div><div className="form-row"><label className="field">Harga reseller per unit (Rp)<input name="resellerPrice" type="number" min={0} max={1000000000} step={1} defaultValue={product?.resellerPrice??""} placeholder="Opsional"/></label><label className="field">Masa garansi (jam)<input name="warrantyHours" type="number" min={0} max={87600} step={1} required defaultValue={product?.warrantyHours??0}/><small>24 = 1 hari. 0 = perlu pemeriksaan owner. Berlaku untuk penjualan baru.</small></label></div><label className="field">Peringatan stok minimum<input name="minStock" type="number" required min={0} max={100000} step={1} defaultValue={product?.minStock??10}/><small>Produk ditandai menipis saat stok mencapai jumlah ini atau kurang.</small></label>{!product&&<label className="field"><div className="flex items-center justify-between"><span>Stok awal / Kredensial akun (Opsional)</span>{detectedInitialCount>0&&<span className="text-xs font-semibold text-[#e77740]">✓ {detectedInitialCount} stok terdeteksi</span>}</div><textarea rows={3} placeholder={type==="link"?"1. https://invite.link/1\n2. https://invite.link/2":"1. email@gmail.com|password123\n2. username:password\n3. https://link-aktivasi.com"} value={initialStock} onChange={e=>setInitialStock(e.target.value)}/><small>Isi 1 baris per akun/link/lisensi. Nomor urut (1., 2.) dari supplier otomatis dibersihkan.</small></label>}<div className="border border-[#e4e1d8] rounded-xl p-3 bg-[#fbfaf7] space-y-2.5"><div className="flex items-center justify-between"><label htmlFor="custom-wa-check" className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#2c3038]"><input type="checkbox" id="custom-wa-check" checked={customWa} onChange={e=>{setCustomWa(e.target.checked);if(e.target.checked&&!waTemplate.trim())setWaTemplate(DEFAULT_WA_TEMPLATE);}} className="rounded border-[#d0cdc4] accent-[#e77740]"/><span className="flex items-center gap-1.5"><MessageSquare size={13} className="text-[#e77740]"/>Template WhatsApp Khusus Produk Ini</span></label><span className="text-[11px] text-[#8e939d]">{customWa?"Kustom":"Default toko"}</span></div>{customWa?<div className="space-y-2 pt-1"><div className="flex items-center justify-between"><span className="text-[11px] text-[#6b7280]">Klik tag untuk menyisipkan variabel:</span><button type="button" className="text-[11px] text-[#e77740] hover:underline" onClick={()=>setWaTemplate(DEFAULT_WA_TEMPLATE)}>Reset ke format awal</button></div><div className="flex flex-wrap gap-1">{WA_TEMPLATE_TAGS.slice(0,6).map(t=><button key={t.tag} type="button" className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#dedad1] text-[#333] hover:bg-[#f0ece1]" onClick={()=>setWaTemplate(prev=>prev+" "+t.tag)}>+{t.tag}</button>)}</div><textarea rows={4} className="w-full font-mono text-xs p-2.5 rounded-lg border border-[#dedad1] bg-white text-[#222]" value={waTemplate} onChange={e=>setWaTemplate(e.target.value)} placeholder={DEFAULT_WA_TEMPLATE}/><div className="flex items-center justify-between"><button type="button" className="text-xs text-[#525866] hover:text-[#e77740] flex items-center gap-1" onClick={()=>setShowPreview(!showPreview)}><Sparkles size={12}/>{showPreview?"Sembunyikan pratinjau":"Lihat pratinjau pesan"}</button></div>{showPreview&&<div className="p-2.5 rounded bg-white border border-[#dedad1] text-xs font-sans whitespace-pre-wrap text-[#444] shadow-xs">{formatWhatsAppMessage(waTemplate,{customer:"Budi",productName:`${product?.name||"Produk"} · ${product?.duration||"Varian"}`,duration:product?.duration||"1 Bulan",credentials:"user@example.com|pass123",warrantyUntil:new Date(Date.now()+86400000).toISOString(),orderId:"INV-CONTOH",total:product?.price||20000})}</div>}</div>:<p className="text-[11px] text-[#8e939d] leading-relaxed">Produk ini menggunakan template WhatsApp default toko. Centang opsi di atas jika ingin menambahkan catatan khusus (misalnya instruksi login atau link grup).</p>}</div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-footer"><button type="button" className="btn" onClick={close} disabled={busy}>Batal</button><button className="btn btn-primary" disabled={busy}>{busy?<Loader2 className="animate-spin"/>:<Check/>}Simpan produk</button></div></form>;
}
function SalesView({data,onDetail,onAdd,onDeleteSale,onClearSales}:{data:Inventory;onDetail:(s:Sale)=>void;onAdd:()=>void;onDeleteSale?:(s:Sale)=>void;onClearSales?:()=>void}){
  const owner=useOperator().role==="owner";
  const [query,setQuery]=useState(""),[period,setPeriod]=useState("all"),[kind,setKind]=useState("all"),[page,setPage]=useState(1);
  const filtered=data.sales.filter(s=>(period==="all"||s.createdAt>=new Date(Date.now()-Number(period)*86400000).toISOString())&&(kind==="all"||(s.kind||"sale")===kind)&&`${s.productName} ${s.customer} ${s.id} ${s.reference||""} ${s.actorName||""}`.toLowerCase().includes(query.toLowerCase()));
  const totals=summarizeSales(filtered),pages=Math.max(1,Math.ceil(filtered.length/10)),current=Math.min(page,pages),rows=filtered.slice((current-1)*10,current*10);
  return <><section className="metric-grid"><Metric label="Omzet penjualan" value={money(totals.omzet)} icon={<Wallet/>} note="Sesuai periode dan filter"/><Metric label="Akun terjual" value={num(totals.quantity)} unit="unit" icon={<Boxes/>} note={`${totals.transactions} transaksi penjualan`}/>{owner&&<><Metric label="Laba kotor" value={money(totals.grossProfit)} icon={<TrendingUp/>} note="Omzet dikurangi modal akun terjual"/><Metric label="Biaya penggantian" value={money(totals.replacementCost)} icon={<ShoppingBag/>} note="Modal akun untuk garansi"/></>}</section>
    {owner&&<div className="guarantee-summary"><span>Hasil setelah penggantian <strong>{money(totals.afterReplacement)}</strong></span><span>Belum dikurangi biaya operasional</span></div>}
    <div className="panel sales-list"><div className="panel-heading" style={{paddingBottom:20}}><div><h2>Riwayat pengambilan</h2><span className="text-xs text-[#9499a2]">Waktu WIB</span></div>{owner&&data.sales.length>0&&<button className="btn btn-small text-[#c53935] hover:bg-[#fff0f0] border-[#fed6d6]" onClick={onClearSales}><Trash2 size={13}/><span>Reset Riwayat</span></button>}</div><div className="table-toolbar"><div className="searchbox"><Search/><input aria-label="Cari pengambilan" placeholder="Cari produk, admin, atau pesanan..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div><div className="filters"><Choice value={kind} onChange={v=>{setKind(v);setPage(1);}} label="Jenis pengambilan" options={[{value:"all",label:"Semua pengambilan"},{value:"sale",label:"Penjualan"},{value:"replacement",label:"Penggantian garansi"}]}/><Choice value={period} onChange={v=>{setPeriod(v);setPage(1);}} label="Periode penjualan" options={[{value:"all",label:"Semua waktu"},{value:"7",label:"7 hari terakhir"},{value:"30",label:"30 hari terakhir"}]}/></div></div>
    {rows.length?<Table className="product-table"><TableHeader><TableRow><TableHead>Transaksi</TableHead><TableHead>Produk</TableHead><TableHead>Pelanggan / Diambil Oleh</TableHead><TableHead>Jumlah</TableHead><TableHead>Omzet</TableHead>{owner&&<TableHead>Laba / biaya</TableHead>}<TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(s=>{const replacement=s.kind==="replacement";return <TableRow key={s.id}><TableCell><span className="font-medium">#{s.id.replace("demo-sale-","CONTOH-").slice(0,10).toUpperCase()}</span><div className="text-xs text-[#9a9fa8] mt-1">{formatDate(s.createdAt,true)}</div><span className={`badge mt-2 badge-${replacement?"orange":"green"}`}>{replacement?"Garansi":"Penjualan"}</span></TableCell><TableCell>{s.productName}</TableCell><TableCell className="text-[#8b929e]"><div className="font-medium text-[#2d3138]">{s.customer||"Tanpa nama pelanggan"}</div><div className="text-xs mt-1 text-[#4c525d] flex items-center gap-1 font-medium"><User size={12} className="text-[#9da2aa]"/><span>Diambil: <b className="text-[#20232a] font-semibold">{s.actorName||"Admin"}</b></span></div>{s.reference&&<div className="text-xs mt-0.5 text-[#9a9fa8]">Ref: {s.reference}</div>}</TableCell><TableCell>{s.quantity} unit</TableCell><TableCell>{money(replacement?0:s.total)}</TableCell>{owner&&<TableCell className={replacement?"text-orange":"text-green"}>{money(replacement?s.cost:s.total-s.cost)}<div className="text-xs mt-1">{replacement?"Biaya penggantian":"Laba kotor"}</div></TableCell>}<TableCell className="text-right"><div className="take-row-actions"><button className="icon-btn" aria-label={`Detail transaksi ${s.id}`} onClick={()=>onDetail(s)}><ArrowUpRight/></button>{owner&&<DropdownMenu><DropdownMenuTrigger className="icon-btn" aria-label={`Menu transaksi ${s.id}`}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>onDetail(s)}><Eye/>Lihat detail</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-red-600" onClick={()=>onDeleteSale?.(s)}><Trash2/>Hapus transaksi ini</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div></TableCell></TableRow>;})}</TableBody></Table>:<Blank title={data.sales.length?"Pengambilan tidak ditemukan":"Belum ada pengambilan"} description={data.sales.length?"Ubah periode atau kata pencarian.":"Ambil stok untuk penjualan; omzet dan laba kotor akan dicatat otomatis."}>{!data.sales.length&&<button className="btn btn-primary" onClick={onAdd}><ShoppingBag/>Ambil stok</button>}</Blank>}
    <div className="table-footer"><span>{filtered.length} pengambilan</span><div className="pagination-controls"><button aria-label="Pengambilan sebelumnya" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={13}/></button><span>{current}</span><button aria-label="Pengambilan berikutnya" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={13}/></button></div></div></div></>;
}
function useStockDetails(data:Inventory,demo:boolean,productId?:string,saleId?:string){
  const [stocks,setStocks]=useState<Stock[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!productId&&!saleId){setStocks([]);return;}
    setError("");
    if(demo){setStocks(data.stocks.filter(s=>saleId?s.saleId===saleId:s.productId===productId));setLoading(false);return;}
    let active=true;setLoading(true);setStocks([]);
    requestJSON(`/api/stock?${saleId?"sale":"product"}=${encodeURIComponent(saleId||productId||"")}`,{cache:"no-store"}).then(r=>{const d=r.body;if(!r.ok)throw new Error(d.error);return d;}).then(d=>{if(active)setStocks(d.stocks);}).catch(e=>{if(active)setError(e.message||"Detail tidak dapat dimuat.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[data.stocks,demo,productId,saleId,retry]);
  return {stocks,loading,error,retry:()=>setRetry(r=>r+1)};
}
function StockDetail({product,data,demo,close,mutate,openModal,onDelete}:{product:Product|null;data:Inventory;demo:boolean;close:()=>void;mutate:Mutate;openModal:(k:"product"|"restock"|"sale",p?:Product)=>void;onDelete?:(p:Product)=>void}){
  const owner=useOperator().role==="owner";
  const {stocks,loading,error,retry}=useStockDetails(data,demo,product?.id),[tab,setTab]=useState("ready"),[visible,setVisible]=useState<string[]>([]),[busy,setBusy]=useState(""),[page,setPage]=useState(1);
  useEffect(()=>{setVisible([]);setTab("ready");setPage(1);},[product?.id]);
  const filtered=stocks.filter(s=>tab==="all"||tab==="ready"&&isReady(s)||tab==="sold"&&(s.state==="sold"||s.state==="replaced")||tab==="invalid"&&(s.state==="invalid"||s.state==="ready"&&isExpired(s))),pages=Math.max(1,Math.ceil(filtered.length/20)),current=Math.min(page,pages);
  async function update(s:Stock,state:string){setBusy(s.id);try{await mutate({action:"stockState",id:s.id,state});toast.success("Status stok diperbarui");}catch(e){toast.error((e as Error).message);}finally{setBusy("");}}
  return <Sheet open={!!product} onOpenChange={o=>{if(!o)close();}}><SheetContent className="detail-sheet">{product&&<><SheetHeader><SheetTitle><ProductSymbol product={product}/>{product.name}</SheetTitle><SheetDescription>{product.duration} · {typeLabels[product.type]} · {money(product.price)} / unit</SheetDescription></SheetHeader><div className="detail-body"><div className="detail-stats"><div><strong>{stocks.filter(isReady).length}</strong><span>Siap jual</span></div><div><strong>{stocks.filter(s=>s.state==="sold"||s.state==="replaced").length}</strong><span>Diambil</span></div><div><strong>{stocks.filter(s=>s.state==="invalid"||s.state==="ready"&&isExpired(s)).length}</strong><span>Nonaktif</span></div></div>{owner&&<div className="flex items-center gap-2 mt-3 mb-2"><button className="btn btn-small" onClick={()=>{close();openModal("product",product);}}><Pencil size={13}/>Edit produk</button><button className="btn btn-small text-[#c53935] hover:bg-[#fff0f0] border-[#fed6d6]" onClick={()=>{close();onDelete?.(product);}}><Trash2 size={13}/>Hapus produk</button></div>}<div className="detail-toolbar"><Tabs value={tab} onValueChange={v=>{setTab(v);setPage(1);}}><TabsList><TabsTrigger value="ready">Siap jual</TabsTrigger><TabsTrigger value="sold">Diambil</TabsTrigger><TabsTrigger value="invalid">Nonaktif</TabsTrigger><TabsTrigger value="all">Semua</TabsTrigger></TabsList></Tabs></div>{loading?<div className="space-y-3"><Skeleton className="h-20"/><Skeleton className="h-20"/></div>:error?<div role="alert" className="form-error">{error}<button className="btn btn-small mt-2" onClick={retry}>Coba lagi</button></div>:filtered.length?<>{filtered.slice((current-1)*20,current*20).map(s=><div className="stock-item" key={s.id}><div className="stock-value"><code>{!s.value?`Stok #${s.id.slice(0,8).toUpperCase()}`:visible.includes(s.id)?s.value:"••••••••••••••••••••••••"}</code><small>{s.state==="sold"?"Terjual":s.state==="replaced"?"Penggantian garansi":s.state==="invalid"?"Bermasalah":isExpired(s)?"Kedaluwarsa":"Siap jual"}{s.expiresAt?` · Berlaku s.d. ${formatDate(s.expiresAt)}`:" · Tanpa batas tanggal"}</small></div>{s.value&&<button className="icon-btn" onClick={()=>setVisible(v=>v.includes(s.id)?v.filter(id=>id!==s.id):[...v,s.id])} aria-label={visible.includes(s.id)?"Sembunyikan isi stok":"Tampilkan isi stok"}>{visible.includes(s.id)?<EyeOff size={14}/>:<Eye size={14}/>}</button>}{s.value&&<button className="icon-btn" title="Salin kredensial / akun ini" aria-label="Salin kredensial" onClick={()=>copyText(s.value||"")}><Copy size={14}/></button>}{!s.saleId&&!isExpired(s)&&<DropdownMenu><DropdownMenuTrigger className="icon-btn" aria-label="Ubah status stok" disabled={busy===s.id}>{busy===s.id?<Loader2 className="animate-spin"/>:<MoreHorizontal/>}</DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>update(s,s.state==="invalid"?"ready":"invalid")}>{s.state==="invalid"?<Check/>:<CircleAlert/>}{s.state==="invalid"?"Aktifkan kembali":"Tandai bermasalah"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>)}<div className="table-footer px-0"><span>{filtered.length} unit stok</span><div className="pagination-controls"><button aria-label="Stok sebelumnya" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={13}/></button><span>{current}</span><button aria-label="Stok berikutnya" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={13}/></button></div></div></>:<Blank title="Belum ada stok di sini" description="Tambahkan stok baru atau pilih status lain."/>}</div><div className="sheet-actions"><button className="btn" onClick={()=>{close();openModal("restock",product);}}><Plus/>Tambah stok</button><button className="btn btn-primary" disabled={!stocks.some(isReady)||loading} onClick={()=>{close();openModal("sale",product);}}><ShoppingBag/>Ambil stok</button></div></>}</SheetContent></Sheet>;
}
function SaleDetails({sale,data,demo,close,onWarranty,onShowSale,onDeleteSale}:{sale:Sale|null;data:Inventory;demo:boolean;close:()=>void;onWarranty:(s:Sale)=>void;onShowSale:(s:Sale)=>void;onDeleteSale?:(s:Sale)=>void}){
  const owner=useOperator().role==="owner";
  const {stocks,loading,error,retry}=useStockDetails(data,demo,undefined,sale?.id),[show,setShow]=useState(false);
  useEffect(()=>setShow(false),[sale?.id]);
  const replacement=sale?.kind==="replacement";
  const followups=data.sales.filter(s=>s.originalSaleId===(sale?.originalSaleId||sale?.id));
  const claimedIds=new Set((data.claims||[]).map(c=>c.originalStockId));
  const deliverable=stocks.filter(s=>!claimedIds.has(s.id));
  return <Sheet open={!!sale} onOpenChange={o=>{if(!o)close();}}><SheetContent className="detail-sheet">{sale&&<><SheetHeader><SheetTitle>{replacement?"Detail penggantian garansi":"Detail penjualan"}</SheetTitle><SheetDescription>#{sale.id.slice(0,10).toUpperCase()} {sale.createdAt?`· ${formatDate(sale.createdAt,true)} WIB`:""}</SheetDescription></SheetHeader><div className="detail-body"><div className="record-card"><div className="flex justify-between gap-4 mb-4"><strong className="text-sm">{sale.productName}</strong><span className={`badge badge-${replacement?"orange":"green"}`}>{replacement?"Garansi":"Terjual"}</span></div><p className="text-sm text-[#969ba4] mb-2">Pelanggan: <span className="text-[#2d3138] font-medium">{sale.customer||"Tidak dicantumkan"}</span></p><p className="text-sm text-[#969ba4] mb-2 flex items-center gap-1.5"><User size={14} className="text-[#8e939d]"/><span>Diambil oleh: <strong className="text-[#2d3138] font-semibold">{sale.actorName||"Belum tercatat"}</strong></span></p>{sale.reference&&<p className="text-sm text-[#969ba4] mb-3">Referensi: {sale.reference}</p>}{sale.warrantyUntil&&<p className="take-meta mb-3">Garansi s.d. {formatDate(sale.warrantyUntil,true)} WIB</p>}{sale.originalSaleId&&<p className="take-meta mb-3">Pesanan asal #{sale.originalSaleId.slice(0,10).toUpperCase()}</p>}<div className="sale-summary"><span>{sale.quantity} unit · omzet</span><strong>{money(replacement?0:sale.total)}</strong></div>{owner&&<div className="flex flex-wrap justify-between gap-2 text-xs text-[#969ba4] mt-3"><span>{replacement?"Biaya penggantian":"Modal stok"} {money(sale.cost||0)}</span>{!replacement&&<span>Laba kotor {money((sale.total||0)-(sale.cost||0))}</span>}</div>}</div><div className="flex justify-between items-center mt-6 mb-3"><h3 className="font-semibold text-sm">Stok yang dialokasikan</h3><button className="link-btn" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}{show?"Sembunyikan":"Tampilkan"}</button></div><p className="take-meta mb-3">Salin ulang dari sini tidak membuat transaksi baru. Akun yang sudah diganti dikecualikan dari salin dan unduh.</p>{followups.length>0&&<div className="replacement-history mb-4"><strong>Riwayat penggantian</strong>{followups.map(s=><button key={s.id} className="link-btn" onClick={()=>onShowSale(s)}>#{s.id.slice(0,10).toUpperCase()} · {s.quantity} unit · {formatDate(s.createdAt,true)} <ArrowUpRight/></button>)}</div>}<div className="flex flex-wrap items-center gap-2 mb-4"><button className="btn btn-small" onClick={()=>onWarranty(sale)}><ShieldCheck/>Proses garansi pesanan ini</button>{owner&&<button className="btn btn-small text-[#c53935] hover:bg-[#fff0f0] border-[#fed6d6]" onClick={()=>onDeleteSale?.(sale)}><Trash2 size={13}/>Hapus transaksi ini</button>}</div>{loading?<Skeleton className="h-32"/>:error?<div className="form-error" role="alert">{error}<button className="btn btn-small mt-2" onClick={retry}>Coba lagi</button></div>:stocks.map((s,i)=><div className="stock-item" key={s.id}><span className="text-xs text-[#b1b3b8]">{i+1}.</span><div className="stock-value"><code>{show?s.value:"••••••••••••••••••••••••"}</code>{claimedIds.has(s.id)&&<span className="badge badge-orange">Sudah diganti</span>}</div><button className="icon-btn" disabled={claimedIds.has(s.id)} aria-label={`Salin stok ke-${i+1}`} onClick={()=>copyText(s.value||"")}><Copy/></button></div>)}</div><div className="sheet-actions"><button className="btn" disabled={loading||!deliverable.length} onClick={()=>{const p=data.products.find(pr=>pr.id===sale.productId);const chat=formatWhatsAppMessage(p?.waTemplate||data.defaultWaTemplate,{customer:sale.customer,productName:sale.productName,duration:p?.duration,credentials:deliverable.map(s=>s.value).join("\n"),warrantyUntil:sale.warrantyUntil,orderId:sale.id,total:sale.total,actorName:sale.actorName,createdAt:sale.createdAt});copyText(chat);}}><MessageSquare size={14}/>Salin Pesan WA</button><button className="btn" disabled={loading||!deliverable.length} onClick={()=>downloadFile(`jstore-pesanan-${sale.id.slice(0,10)}.txt`,deliverable.map(s=>s.value).join("\n"),"text/plain;charset=utf-8")}><Download size={14}/>Unduh .txt</button><button className="btn btn-primary" disabled={loading||!deliverable.length} onClick={()=>copyText(deliverable.map(s=>s.value).join("\n"))}><Copy size={14}/>Salin akun</button></div></>}</SheetContent></Sheet>;
}
async function copyText(value:string){try{await navigator.clipboard.writeText(value);toast.success("Berhasil disalin");}catch{toast.error("Salin otomatis belum tersedia. Tampilkan isi stok lalu salin secara manual.");}}
function downloadFile(filename:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
