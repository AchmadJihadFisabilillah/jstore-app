"use client";

import { useState, useMemo, useRef, type ChangeEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  AlertCircle,
  Package,
  Layers,
  Sparkles,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseProductBulkInput,
  PRODUCT_CSV_TEMPLATE,
  type ParsedProductRow,
  type ProductImportIssue,
} from "@/lib/product-parser";
import { money, num, type MutateInventory } from "@/lib/inventory";

interface BulkProductModalProps {
  mutate: MutateInventory;
  close: () => void;
}

export function BulkProductModal({ mutate, close }: BulkProductModalProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!input.trim()) return { valid: [], issues: [] };
    return parseProductBulkInput(input);
  }, [input]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInput(content);
        toast.success(`File ${file.name} berhasil dibaca`);
      }
    };
    reader.onerror = () => {
      toast.error("Gagal membaca file.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(PRODUCT_CSV_TEMPLATE);
      toast.success("Format contoh berhasil disalin ke clipboard!");
    } catch {
      toast.error("Gagal menyalin format.");
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([PRODUCT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-produk-jstore.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Template CSV berhasil diunduh.");
  };

  const handleFillSample = () => {
    setInput(PRODUCT_CSV_TEMPLATE);
    toast.info("Contoh data produk dimasukkan.");
  };

  const handleSubmit = async () => {
    if (!parsed.valid.length) {
      setError("Tidak ada data produk yang valid untuk diimpor.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await mutate({
        action: "bulkProducts",
        products: parsed.valid,
      });

      toast.success(`Berhasil mengimpor ${parsed.valid.length} produk baru!`);
      close();
    } catch (err) {
      setError((err as Error).message || "Gagal mengimpor produk.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulk-product-modal-view">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#eeebe4]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-small"
            onClick={handleDownloadTemplate}
          >
            <Download size={14} />
            <span>Unduh Template CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={handleCopyTemplate}
          >
            <Copy size={14} />
            <span>Salin Format</span>
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={handleFillSample}
          >
            <Sparkles size={14} />
            <span>Isi Contoh Data</span>
          </button>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="btn btn-small"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            <span>Unggah File CSV / TXT</span>
          </button>
        </div>
      </div>

      <div className="field">
        <label className="text-xs font-semibold text-[#686c75] mb-1 flex items-center justify-between">
          <span>Tempel Data Produk (CSV / Baris Teks / Excel):</span>
          {input && (
            <button
              type="button"
              className="text-[#bd3434] hover:underline flex items-center gap-1 font-normal text-xs"
              onClick={() => setInput("")}
            >
              <Trash2 size={12} /> Bersihkan
            </button>
          )}
        </label>
        <textarea
          rows={6}
          className="w-full text-xs font-mono p-2.5 rounded-lg border border-[#e2dec9] bg-[#fdfdfb] focus:outline-none focus:ring-2 focus:ring-[#e77740]"
          placeholder={`Format Kolom:\nNama Produk, Kategori, Varian/Durasi, Jenis (account/link/license), Harga Jual, Modal, [Harga Reseller], [Garansi Jam], [Min Stok]\n\nContoh:\nNetflix Premium, Streaming, 1 Bulan, account, 25000, 18000, 23000, 24, 5\nSpotify Premium, Musik, 3 Bulan, account, 15000, 9000, 13000, 72, 10`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <small className="text-[11px] text-[#8e939d] mt-1 block">
          Tips: Anda bisa langsung copy-paste tabel dari Excel atau file CSV dengan pemisah koma, titik-koma, atau tab.
        </small>
      </div>

      {/* Parsing Stats */}
      {input.trim() && (
        <div className="mt-4 mb-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-[#276e39]">
              <Check size={15} /> {parsed.valid.length} Produk Valid
            </span>
            {parsed.issues.length > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-[#bd3434]">
                <AlertCircle size={15} /> {parsed.issues.length} Baris Dilewati / Tidak Lengkap
              </span>
            )}
          </div>
        </div>
      )}

      {/* Validation Issues Alert */}
      {parsed.issues.length > 0 && (
        <div className="bg-[#fff7f7] border border-[#fbd4d4] rounded-lg p-2.5 mb-3 max-h-24 overflow-y-auto text-[11px] text-[#aa2d2d] space-y-1">
          {parsed.issues.map((iss, idx) => (
            <div key={idx}>
              <strong>Baris {iss.line}:</strong> {iss.reason} <span className="opacity-75">({iss.raw.slice(0, 40)}...)</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview Table */}
      {parsed.valid.length > 0 && (
        <div className="mt-2 mb-4 border border-[#e7e4dc] rounded-lg max-h-48 overflow-auto bg-white">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-[#f9f8f5] border-b border-[#e7e4dc] text-[#70757f]">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Nama Produk</th>
                <th className="p-2">Kategori</th>
                <th className="p-2">Durasi</th>
                <th className="p-2">Tipe</th>
                <th className="p-2">Harga Jual</th>
                <th className="p-2">Modal</th>
                <th className="p-2">Stok Awal</th>
                <th className="p-2">Garansi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2efe9]">
              {parsed.valid.map((p, idx) => (
                <tr key={idx} className="hover:bg-[#faf9f6]">
                  <td className="p-2 text-[#999fa9]">{idx + 1}</td>
                  <td className="p-2 font-medium text-[#2b2e35]">{p.name}</td>
                  <td className="p-2 text-[#686c76]">{p.category}</td>
                  <td className="p-2 text-[#686c76]">{p.duration}</td>
                  <td className="p-2 text-[#686c76] capitalize">{p.type}</td>
                  <td className="p-2 text-[#2b2e35] font-semibold">{money(p.price)}</td>
                  <td className="p-2 text-[#686c76]">{money(p.cost)}</td>
                  <td className="p-2">
                    {p.initialStock && p.initialStock.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#e7f5ea] text-[#1b6b30]">
                        {p.initialStock.length} unit ({p.initialStock[0].length > 15 ? `${p.initialStock[0].slice(0, 15)}...` : p.initialStock[0]})
                      </span>
                    ) : (
                      <span className="text-[#9ea3ae]">-</span>
                    )}
                  </td>
                  <td className="p-2 text-[#686c76]">{p.warrantyHours ? `${p.warrantyHours} Jam` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="form-error mb-3" role="alert">
          {error}
        </p>
      )}

      <div className="form-footer mt-4 pt-3 border-t border-[#eeebe4]">
        <button
          type="button"
          className="btn"
          onClick={close}
          disabled={busy}
        >
          Batal
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={busy || !parsed.valid.length}
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          <span>
            {parsed.valid.length > 0
              ? `Impor ${parsed.valid.length} Produk`
              : "Impor Produk"}
          </span>
        </button>
      </div>
    </div>
  );
}
