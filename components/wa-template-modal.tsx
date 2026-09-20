"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, MessageSquare, RotateCcw, Save, Sparkles, Check, Copy } from "lucide-react";
import { DEFAULT_WA_TEMPLATE, WA_TEMPLATE_TAGS, formatWhatsAppMessage } from "@/lib/whatsapp-template";
import { requestJSON } from "@/lib/client-request";

interface WaTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTemplate?: string;
  onSaved: (newTemplate: string) => void;
  demo?: boolean;
}

export function WaTemplateModal({
  open,
  onOpenChange,
  currentTemplate = "",
  onSaved,
  demo = false,
}: WaTemplateModalProps) {
  const [template, setTemplate] = useState(currentTemplate || DEFAULT_WA_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTemplate(currentTemplate || DEFAULT_WA_TEMPLATE);
    }
  }, [open, currentTemplate]);

  function insertTag(tag: string) {
    const el = textareaRef.current;
    if (!el) {
      setTemplate((prev) => prev + " " + tag);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = template.substring(0, start);
    const after = template.substring(end);
    const updated = before + tag + after;
    setTemplate(updated);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + tag.length;
    }, 50);
  }

  async function handleSave() {
    setBusy(true);
    try {
      if (!demo) {
        const res = await requestJSON("/api/inventory", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-jstore-request": "1",
          },
          body: JSON.stringify({
            action: "updateSettings",
            key: "defaultWaTemplate",
            value: template,
          }),
        });
        if (!res.ok) throw new Error(res.body?.error || "Gagal menyimpan template");
      }
      toast.success("Template default WhatsApp berhasil disimpan!");
      onSaved(template);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  // Realistic sample data for live preview
  const previewText = formatWhatsAppMessage(template, {
    customer: "Budi Santoso",
    productName: "Canva Pro Edu · 1 Tahun",
    duration: "1 Tahun",
    credentials: "https://canva.com/brand/join?token=contoh-invite-token-123",
    warrantyUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
    orderId: "INV-2026-0920",
    total: 25000,
    actorName: "Admin Toko",
    createdAt: new Date().toISOString(),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#e77740] flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <div>
              <DialogTitle>Template Pesan WhatsApp Toko</DialogTitle>
              <DialogDescription>
                Atur format pesan WhatsApp default yang otomatis disalin saat admin/owner mengambil stok.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Tag inserter buttons */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#555962]">
                Klik tag untuk menyisipkan variabel:
              </span>
              <button
                type="button"
                className="text-xs text-[#e77740] hover:underline flex items-center gap-1 font-medium"
                onClick={() => setTemplate(DEFAULT_WA_TEMPLATE)}
              >
                <RotateCcw size={12} /> Reset ke Format JStore
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WA_TEMPLATE_TAGS.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => insertTag(t.tag)}
                  className="inline-flex items-center px-2 py-1 rounded bg-[#f5f4ef] hover:bg-[#eae7dd] text-[#2c2f36] text-xs font-mono border border-[#e0ded6] transition-colors"
                  title={`${t.label}: ${t.desc}`}
                >
                  <span className="text-[#e77740] font-bold mr-1">+</span> {t.tag}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea Editor */}
          <div>
            <textarea
              ref={textareaRef}
              rows={8}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={DEFAULT_WA_TEMPLATE}
              className="w-full font-mono text-xs p-3 rounded-lg border border-[#dedad1] bg-white text-[#222] focus:outline-none focus:ring-2 focus:ring-[#e77740] focus:border-transparent leading-relaxed"
            />
            <p className="text-[11px] text-[#8e939d] mt-1">
              Catatan: Jika suatu produk memiliki template khusus sendiri, template produk tersebut yang akan diprioritaskan.
            </p>
          </div>

          {/* Live Preview */}
          <div className="rounded-xl border border-[#e8e5dc] bg-[#faf9f5] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#444]">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#e77740]" />
                Pratinjau Pesan yang Diterima Pelanggan:
              </span>
              <button
                type="button"
                className="text-[#e77740] hover:underline flex items-center gap-1 text-[11px]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(previewText);
                    toast.success("Contoh pesan disalin!");
                  } catch {}
                }}
              >
                <Copy size={12} /> Salin Contoh
              </button>
            </div>
            <div className="whitespace-pre-wrap font-sans text-xs bg-white p-3 rounded-lg border border-[#e7e4dc] text-[#333] shadow-sm leading-relaxed">
              {previewText}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#eee]">
          <button
            type="button"
            className="btn"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {busy ? "Menyimpan…" : "Simpan Template Toko"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
