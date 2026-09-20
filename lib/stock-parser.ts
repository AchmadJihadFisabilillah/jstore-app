export type ImportIssue={line:number;value:string;reason:string};
export type StockImport={values:string[];duplicates:number;ignored:ImportIssue[];issues:ImportIssue[]};
const userLabel="(?:e-?mail(?:\\s*\\/\\s*(?:user|username))?|username|user|akun)";
const passLabel="(?:password|pass|sandi|pw)";
const userPattern=new RegExp(`^${userLabel}\\s*[:=]\\s*(.*)$`,"i");
const passPattern=new RegExp(`^${passLabel}\\s*[:=]\\s*(.*)$`,"i");
function identifier(value:string){
  return value.trim().replace(/^\[([^\]]+)\]\(mailto\\?:[^)]+\)$/i,"$1").replace(/\\@/g,"@");
}
function validIdentifier(value:string){
  return !!value&&!/[\s|<>\[\]\\]/.test(value)&&(!value.includes("@")||/^[^@]+@[^@]+\.[^@]+$/.test(value));
}
/** Split recognizable supplier record boundaries, preserving the original source line for review. */
function supplierLines(input:string,type:string,mode:"auto"|"lines"){
  return input.split(/\r?\n/).flatMap((raw,index)=>{
    if(mode!=="auto"||type!=="account"||/^\s*(?:\d+[.)]\s*)?[^\s|]+\|/.test(raw))return [{raw,line:index+1}];
    const text=raw.replace(/\[(👤|📧|🔑)\]\(https:\/\/web\.telegram\.org\/k\/assets\/img\/emoji\/[^)]+\)/gu,"$1")
      .replace(/\s*(?=[👤📧🔑]\s*(?:Account\s+\d+|Email(?:\/User)?\s*[:=]|Password\s*[:=]))/gu,"\n")
      .replace(new RegExp(`\\s+(?=\\d+[.)]\\s*${userLabel}\\s*[:=])`,"gi"),"\n")
      .replace(new RegExp(`\\s+-\\s*(?=${passLabel}\\s*[:=])`,"gi"),"\n");
    return text.split("\n").map(raw=>({raw,line:index+1}));
  });
}
/** Unknown or incomplete credentials are shown for review, never imported as an account. */
export function parseStockInput(input:string,type:string,mode:"auto"|"lines"="auto"):StockImport{
  const out:StockImport={values:[],duplicates:0,ignored:[],issues:[]},seen=new Set<string>();
  let pending:{value:string;line:number}|null=null;
  const add=(value:string)=>{if(seen.has(value))out.duplicates++;else{seen.add(value);out.values.push(value);}};
  const incomplete=()=>{if(pending){out.issues.push({...pending,reason:"Akun ini belum memiliki password."});pending=null;}};
  for(const {raw,line} of supplierLines(input,type,mode)){
    let value=raw.trim();if(!value)continue;
    value=value.replace(/^\s*\d+[\.\)\-:\s]\s*/,"").replace(/^(?:[-•*]\s+)/,"").trim();
    if(!value)continue;
    if(mode==="auto"){
      value=value.replace(/^`([^`]+)`$/,"$1");
      const link=value.match(/^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/);if(link)value=link[1];
      const labeled=value.replace(/^[^\p{L}\p{N}*]+/u,"").replace(/^\*\*([^*]+)\*\*/,"$1");
      if(/^[\s─━═—_=\-*•]+$/.test(value)||/^(?:order(?:\s*id)?|id\s*order|invoice|produk|product|item|tanggal|metode(?:\s*pembayaran)?|pembayaran|total|harga|durasi|jumlah|status)\s*[:=#]/i.test(labeled)||/^\*?(?:PRODUCT|ACCOUNT)\s+DETAIL\b/i.test(labeled)||/^Account\s+\d+\s*$/i.test(labeled)||/^Success\s*-\s*order delivered\s*$/i.test(labeled)){
        incomplete();out.ignored.push({line,value:raw,reason:"Header pesan supplier"});continue;
      }
      if(type==="account"){
        const user=labeled.match(userPattern),pass=labeled.match(passPattern);
        if(user){
          incomplete();const account=identifier(user[1]);
          if(validIdentifier(account))pending={value:account,line};else out.issues.push({line,value:raw,reason:"Email atau username belum valid."});
          continue;
        }
        if(pass){
          if(pending&&pass[1]){add(`${pending.value}|${pass[1]}`);pending=null;}
          else{incomplete();out.issues.push({line,value:raw,reason:"Password kosong atau belum berpasangan dengan akun."});}
          continue;
        }
        const account=identifier(value);
        if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)&&validIdentifier(account)){incomplete();pending={value:account,line};continue;}
      }
    }
    incomplete();
    if(type==="account"){
      const sep=value.indexOf("|");
      let account="", password="";
      if(sep>0){
        account=identifier(value.slice(0,sep));
        password=value.slice(sep+1);
      }else{
        const colonMatch=value.match(/^([^:\s]+):(.+)$/);
        if(colonMatch){
          account=identifier(colonMatch[1]);
          password=colonMatch[2];
        }else if(mode==="lines"){
          const spaceMatch=value.match(/^([^\s]+)\s+(.+)$/);
          if(spaceMatch){
            account=identifier(spaceMatch[1]);
            password=spaceMatch[2];
          }
        }
      }
      if(validIdentifier(account)&&password)add(`${account}|${password}`);
      else if(mode==="lines"&&value.length>0)add(value);
      else out.issues.push({line,value:raw,reason:"Gunakan format username|password, email:password, atau pilih tab 'Satu stok per baris'."});
    }else if(type==="link"){
      try{const parsed=new URL(value);if(!/^https?:$/.test(parsed.protocol)||/\s/.test(value))throw new Error();add(value);}catch{out.issues.push({line,value:raw,reason:"Link harus berupa URL http atau https yang lengkap."});}
    }else add(value);
  }
  incomplete();return out;
}
