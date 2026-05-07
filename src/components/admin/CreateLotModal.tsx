"use client";

import { useState } from "react";
import { X, Loader2, Plus, DollarSign, Hash, MapPin, Layers } from "lucide-react";
import { createLot } from "@/actions/postventa";

interface Props {
  projectSlug: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateLotModal({ projectSlug, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    number: "",
    stage: "",
    area_m2: "",
    price_total_clp: "",
    reservation_amount_clp: "",
    pie: "",
    cuotas: "",
    valor_cuota: "",
    last_installment_amount: "",
  });

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.number.trim()) return setError("El número de lote es obligatorio.");
    if (!form.price_total_clp) return setError("El precio total es obligatorio.");
    setSaving(true);
    setError("");

    const res = await createLot({
      projectSlug,
      number: form.number.trim(),
      stage: form.stage.trim() || undefined,
      area_m2: form.area_m2 ? parseFloat(form.area_m2) : undefined,
      price_total_clp: parseInt(form.price_total_clp.replace(/\D/g, "")) || 0,
      reservation_amount_clp: parseInt(form.reservation_amount_clp.replace(/\D/g, "")) || 0,
      pie: parseInt(form.pie.replace(/\D/g, "")) || 0,
      cuotas: form.cuotas ? parseInt(form.cuotas) : undefined,
      valor_cuota: form.valor_cuota ? parseInt(form.valor_cuota.replace(/\D/g, "")) : undefined,
      last_installment_amount: form.last_installment_amount ? parseInt(form.last_installment_amount.replace(/\D/g, "")) : undefined,
    });

    setSaving(false);
    if (res.error) return setError(res.error);
    onSuccess();
  };

  const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold placeholder:text-white/15";
  const labelCls = "block text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-[#050C0C] border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#050C0C]/90 backdrop-blur px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Plus className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Nuevo Lote</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Registro de Unidad Catastral</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-8 space-y-6">
          {/* Identification */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}><Hash className="w-3 h-3 inline mr-1" />Número de Lote *</label>
              <input value={form.number} onChange={e => set("number", e.target.value)} placeholder="Ej: L-60" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}><Layers className="w-3 h-3 inline mr-1" />Etapa</label>
              <input value={form.stage} onChange={e => set("stage", e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}><MapPin className="w-3 h-3 inline mr-1" />Área m²</label>
              <input value={form.area_m2} onChange={e => set("area_m2", e.target.value)} placeholder="Opcional" type="number" className={inputCls} />
            </div>
          </div>

          {/* Financial */}
          <div className="border-t border-white/5 pt-6">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4 flex items-center gap-2"><DollarSign className="w-3 h-3" /> Información Financiera</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Precio Total (CLP) *</label>
                <input value={form.price_total_clp} onChange={e => set("price_total_clp", e.target.value)} placeholder="38490000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Monto Reserva</label>
                <input value={form.reservation_amount_clp} onChange={e => set("reservation_amount_clp", e.target.value)} placeholder="200000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>PIE</label>
                <input value={form.pie} onChange={e => set("pie", e.target.value)} placeholder="14800000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cantidad de Cuotas</label>
                <input value={form.cuotas} onChange={e => set("cuotas", e.target.value)} placeholder="50" type="number" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Valor Cuota</label>
                <input value={form.valor_cuota} onChange={e => set("valor_cuota", e.target.value)} placeholder="500000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Última Cuota</label>
                <input value={form.last_installment_amount} onChange={e => set("last_installment_amount", e.target.value)} placeholder="490000" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-4 rounded-xl btn-metallic-gold text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(212,168,75,0.3)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear Lote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
