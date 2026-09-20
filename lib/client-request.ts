/** A bounded request keeps admin forms recoverable during a stalled connection. */
export async function requestJSON(input:string,options:RequestInit={},timeoutMs=20000):Promise<{ok:boolean;status:number;body:any}>{
  const controller=new AbortController();
  const cancel=()=>controller.abort(options.signal?.reason);
  if(options.signal?.aborted)cancel();else options.signal?.addEventListener("abort",cancel,{once:true});
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try{
    const response=await fetch(input,{...options,signal:controller.signal});
    const text=await response.text();
    let body:any;
    try{body=JSON.parse(text);}catch{
      if(response.ok)throw new Error("Hasil server belum dapat dibaca. Coba muat ulang atau pulihkan pengambilan yang sama.");
      body={error:"Server belum dapat merespons. Coba lagi dengan pengambilan yang sama."};
    }
    return {ok:response.ok,status:response.status,body};
  }catch(error){
    if(timedOut)throw new Error("Koneksi terlalu lama. Pulihkan pengambilan yang sama jika stok sedang diproses.");
    if(error instanceof TypeError)throw new Error("Koneksi terputus. Periksa internet lalu coba lagi.");
    throw error;
  }finally{clearTimeout(timer);options.signal?.removeEventListener("abort",cancel);}
}
// Gateway timeouts and rate limits do not prove that a write was never committed.
export const isDefinitiveRejection=(status:number)=>[400,401,403,404,409,413,422].includes(status);
