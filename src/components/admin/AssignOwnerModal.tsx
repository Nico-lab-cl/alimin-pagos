"use client";

import { useState } from "react";
import { X, Loader2, UserPlus, FileText, MapPin, Briefcase, Hash } from "lucide-react";
import { assignLotOwner } from "@/actions/postventa";
import { toast } from "sonner";

interface Props {
  lot: any;
  projectSlug: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssignOwnerModal({ lot, projectSlug, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    lastName: "",
    email: "",
    phone: "",
    rut: "",
    address_street: "",
    address_number: "",
    address_commune: "",
    address_region: "",
    marital_status: "",
    profession: "",
    nationality: "Chilena",
    pie: lot.pie || 0,
    pie_status: "APPROVED",
    reservation_price: lot.reservation_amount_clp || 0,
    cuotas: lot.cuotas || 0,
    valor_cuota: lot.valor_cuota || 0,
    last_installment_value: lot.last_installment_amount || lot.valor_cuota || 0,
    installments_paid: 0,
    installment_start_date: "",
    daily_penalty: 10000,
    due_day: 5,
    grace_days: 5,
    advisor: "",
    observation: "",
  });

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return setError("El nombre es obligatorio.");
    if (!form.email.trim()) return setError("El correo es obligatorio.");
    if (!form.phone.trim()) return setError("El teléfono es obligatorio.");

    setSaving(true);
    setError("");

    try {
      const res = await assignLotOwner({
        lotId: lot.id,
        projectSlug,
        ...form,
        pie: Number(form.pie),
        reservation_price: Number(form.reservation_price),
        cuotas: Number(form.cuotas),
        valor_cuota: Number(form.valor_cuota),
        last_installment_value: Number(form.last_installment_value),
        installments_paid: Number(form.installments_paid),
        daily_penalty: Number(form.daily_penalty),
        due_day: Number(form.due_day),
        grace_days: Number(form.grace_days),
      });

      if (res.error) {
        setError(res.error);
      } else {
        toast.success("Dueño asignado correctamente", {
          description: `Se ha creado la reserva para ${form.name}`
        });
        onSuccess();
      }
    } catch (e) {
      setError("Error interno al procesar.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold placeholder:text-white/15";
  const labelCls = "block text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-[#050C0C] border border-white/10 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#050C0C]/90 backdrop-blur px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Asignar Dueño</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Lote #{lot.number} {lot.stage ? `- ${lot.stage}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Personal Data */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><UserPlus className="w-3 h-3"/> Datos Personales</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Nombres *</label>
                <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Juan" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Apellidos</label>
                <input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Ej: Pérez" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Correo Electrónico *</label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="ejemplo@correo.com" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Teléfono *</label>
                <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+569..." className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>RUT</label>
                <input value={form.rut} onChange={e => set("rut", e.target.value)} placeholder="12.345.678-9" className={inputCls} />
              </div>
            </div>

            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2 pt-4 border-t border-white/5"><Briefcase className="w-3 h-3"/> Detalles Adicionales</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Estado Civil</label>
                <input value={form.marital_status} onChange={e => set("marital_status", e.target.value)} placeholder="Soltero/a, Casado/a..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Profesión/Oficio</label>
                <input value={form.profession} onChange={e => set("profession", e.target.value)} placeholder="Ingeniero..." className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Nacionalidad</label>
                <input value={form.nationality} onChange={e => set("nationality", e.target.value)} placeholder="Chilena" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Asesor Comercial</label>
                <input value={form.advisor} onChange={e => set("advisor", e.target.value)} placeholder="Ej: Marcela E." className={inputCls} />
              </div>
            </div>

            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2 pt-4 border-t border-white/5"><MapPin className="w-3 h-3"/> Dirección</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Calle</label>
                <input value={form.address_street} onChange={e => set("address_street", e.target.value)} placeholder="Av. Principal" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Número/Depto</label>
                <input value={form.address_number} onChange={e => set("address_number", e.target.value)} placeholder="123" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Comuna</label>
                <input value={form.address_commune} onChange={e => set("address_commune", e.target.value)} placeholder="Santiago" className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Región</label>
                <input value={form.address_region} onChange={e => set("address_region", e.target.value)} placeholder="RM" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Right Column: Financial Data */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><FileText className="w-3 h-3"/> Datos Financieros y Cuotas</h3>
            
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Valor PIE Pagado</label>
                  <input type="number" value={form.pie} onChange={e => set("pie", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reserva Pagada</label>
                  <input type="number" value={form.reservation_price} onChange={e => set("reservation_price", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Total Cuotas Pactadas</label>
                  <input type="number" value={form.cuotas} onChange={e => set("cuotas", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cuotas Ya Pagadas</label>
                  <input type="number" value={form.installments_paid} onChange={e => set("installments_paid", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Valor Cuota</label>
                  <input type="number" value={form.valor_cuota} onChange={e => set("valor_cuota", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Valor Última Cuota</label>
                  <input type="number" value={form.last_installment_value} onChange={e => set("last_installment_value", e.target.value)} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Fecha Inicio 1ra Cuota</label>
                  <input type="date" value={form.installment_start_date} onChange={e => set("installment_start_date", e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2 pt-4 border-t border-white/5"><Hash className="w-3 h-3"/> Configuración de Mora</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Día de Vencimiento</label>
                <input type="number" value={form.due_day} onChange={e => set("due_day", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Días de Gracia</label>
                <input type="number" value={form.grace_days} onChange={e => set("grace_days", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Multa Diaria</label>
                <input type="number" value={form.daily_penalty} onChange={e => set("daily_penalty", e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <label className={labelCls}>Observaciones Iniciales</label>
              <textarea 
                value={form.observation} 
                onChange={e => set("observation", e.target.value)} 
                placeholder="Condiciones especiales, al contado, etc."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold min-h-[100px] resize-none placeholder:text-white/15"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-8 pb-4">
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl">
              {error}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-[2] px-4 py-4 rounded-xl btn-metallic-gold text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(212,168,75,0.3)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Guardar y Asignar Dueño
          </button>
        </div>
      </div>
    </div>
  );
}
