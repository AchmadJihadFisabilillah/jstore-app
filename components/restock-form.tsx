"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Loader2, Check, Sparkles, AlertCircle } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { parseStockInput } from "@/lib/stock-parser";
import { today, isReady, type Inventory, type Product, type MutateInventory } from "@/lib/inventory";
import { useOperator } from "@/components/operator-context";

interface RestockFormProps {
  data: Inventory;
  product?: Product;
  mutate: MutateInventory;
  close: () => void;
}

export function RestockForm({ data, product, mutate, close }: RestockFormProps) {
  const owner = useOperator().role === "owner";
  const [pid, setPid] = useState(product?.id || data.products[0]?.id || "");
  const [input, setInput] = useState("");
  const [cost, setCost] = useState(String(product?.cost ?? data.products[0]?.cost ?? 0));
  const [expiry, setExpiry] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(true); // Default to true so invalid supplier headers don't block saving

  const p = data.products.find((item) => item.id === pid);
  const parsed = useMemo(
    () => parseStockInput(input, p?.type || "account", "auto"),
    [input, p?.type]
  );

  const currentReadyCount = data.stocks.filter((s) => s.productId === pid && isReady(s)).length;
  const newCount = parsed.values.length;
  const totalAfter = currentReadyCount + newCount;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");

    if (!parsed.values.length) {
      setError("Belum ada stok yang terdeteksi. Tempel pesan supplier pada kolom di bawah.");
      return;
    }
    if (parsed.values.length > 500) {
      setError("Maksimal 500 stok sekaligus per impor.");
      return;
    }
    if (parsed.issues.length && !skip) {
      setError("Ada baris pesan yang belum terbaca. Centang 'Lewati baris lain' untuk melanjutkan.");
      return;
    }

    setBusy(true);
    try {
      const result = await mutate({
        action: "restock",
        productId: pid,
        lines: parsed.values,
        ...(owner ? { cost: Number(cost) } : {}),
        expiresAt: expiry || null,
        reference: reference.trim(),
      });
      const duplicates = parsed.duplicates + (result.duplicates || 0);
      const inserted = result.inserted ?? 0;
      toast.success(
        `${inserted} stok berhasil ditambahkan (Total stok: ${currentReadyCount + inserted} unit)${
          duplicates ? ` · ${duplicates} duplikat dilewati` : ""
        }`
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <fieldset disabled={busy} className="form-stack border-0 p-0 min-w-0">
        {/* 1. Pilih Produk */}
        <label className="field">
          Produk & Varian
          <Select
            value={pid}
            onValueChange={(v) => {
              setPid(v);
              setCost(String(data.products.find((item) => item.id === v)?.cost || 0));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.products.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {item.duration}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {/* 2. Counter Ringkas Stok */}
        <div className="bg-[#faf9f5] border border-[#e8e4db] rounded-lg p-3 text-xs flex items-center justify-between">
          <div>
            <span className="text-[#878c96] block text-[11px]">Stok saat ini</span>
            <b className="text-sm text-[#2d3139]">{currentReadyCount} unit</b>
          </div>
          <div className="text-base text-[#9a9fa8] font-bold">+</div>
          <div>
            <span className="text-[#878c96] block text-[11px]">Tambah baru</span>
            <b className={`text-sm ${newCount > 0 ? "text-[#e77740]" : "text-[#777]"}`}>
              +{newCount} unit
            </b>
          </div>
          <div className="text-base text-[#9a9fa8] font-bold">=</div>
          <div>
            <span className="text-[#878c96] block text-[11px]">Total stok nanti</span>
            <b className={`text-sm ${newCount > 0 ? "text-[#22863a]" : "text-[#2d3139]"}`}>
              {totalAfter} unit
            </b>
          </div>
        </div>

        {/* 3. Tempel Pesan Lengkap */}
        <label className="field">
          <span className="flex items-center justify-between">
            <span className="font-semibold text-[#2d3139]">Tempel Pesan Lengkap</span>
            <span className="text-[11px] text-[#93979f] font-normal flex items-center gap-1">
              <Sparkles size={12} className="text-[#e77740]" /> Otomatis dibersihkan
            </span>
          </span>
          <textarea
            rows={7}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            required
            maxLength={2000000}
            placeholder={
              p?.type === "link"
                ? "Tempel pesan dari supplier di sini...\n\nContoh:\n1. https://contoh.com/invite-1\n2. https://contoh.com/invite-2"
                : "Tempel pesan dari supplier di sini...\n\nContoh:\nORDER ID: SUP-992\n1. akun1@gmail.com|pass123\n2. Email: akun2@gmail.com\nPassword: sandi-kedua\nTerima kasih sudah order!"
            }
          />
          <small className="text-[#878c96]">
            Langsung tempel seluruh pesan WA/Telegram supplier. Nomor urut (1., 2.) dan tulisan pembuka/penutup otomatis dibersihkan.
          </small>
        </label>

        {/* 4. Preview Hasil Otomatis */}
        {input.trim() && (
          <div className="bg-[#fcfbf9] border border-[#e6e2d8] rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <strong className="text-emerald-700 flex items-center gap-1.5 font-medium">
                <Check size={14} className="text-emerald-600" />
                {parsed.values.length} stok valid terdeteksi
              </strong>
              {parsed.duplicates > 0 && (
                <span className="text-[#999]">{parsed.duplicates} duplikat dilewati</span>
              )}
            </div>

            {parsed.values.length > 0 && (
              <details className="text-[11px] text-[#555]">
                <summary className="cursor-pointer text-[#e77740] hover:underline font-medium">
                  Pratinjau {parsed.values.length} data yang terbaca
                </summary>
                <pre className="mt-2 p-2 bg-white border border-[#eee] rounded max-h-28 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-[#333]">
                  {parsed.values.join("\n")}
                </pre>
              </details>
            )}

            {parsed.issues.length > 0 && (
              <div className="pt-1 border-t border-[#eee]">
                <label className="flex items-center gap-2 cursor-pointer text-[#555]">
                  <input
                    type="checkbox"
                    checked={skip}
                    onChange={(e) => setSkip(e.target.checked)}
                    className="rounded border-[#d0cdc4] accent-[#e77740]"
                  />
                  <span>
                    Abaikan {parsed.issues.length} baris pengantar/penutup supplier yang bukan akun.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* 5. Detail Tambahan (Opsional) */}
        <div className="form-row">
          {owner && (
            <label className="field">
              Modal per unit (Rp)
              <input
                type="number"
                min={0}
                max={1000000000}
                required
                step={1}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            Batas waktu stok (opsional)
            <input
              type="date"
              value={expiry}
              min={today()}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          Nama Supplier / Catatan (opsional)
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={150}
            placeholder="Contoh: Supplier Telegram @jono · Batch 1"
          />
        </label>
      </fieldset>

      {error && (
        <div className="form-error flex items-center gap-1.5" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="form-footer">
        <button type="button" className="btn" disabled={busy} onClick={close}>
          Batal
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !parsed.values.length || (!!parsed.issues.length && !skip)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Tambahkan {parsed.values.length > 0 ? `${parsed.values.length} Stok` : "Stok"}
        </button>
      </div>
    </form>
  );
}
