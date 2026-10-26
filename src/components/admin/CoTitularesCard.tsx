"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Pencil, Trash2, Send, Loader2, X, Save } from "lucide-react";
import {
  agregarCoTitular, actualizarCoTitular, quitarCoTitular, enviarAccesoCoTitular,
} from "@/actions/postventa";

/**
 * Co-titulares de la ficha: la segunda persona que firmo la promesa. Entra al
 * portal con su propio correo, ve el mismo lote y recibe los mismos correos y
 * WhatsApp que el titular. El titular sigue siendo el de la ficha.
 */

type Formulario = {
  name: string;
  rut: string;
  email: string;
  phone: string;
  address: string;
  marital_status: string;
  profession: string;
  nationality: string;
};

const VACIO: Formulario = {
  name: "", rut: "", email: "", phone: "", address: "",
  marital_status: "", profession: "", nationality: "Chilena",
};

const CAMPOS: { key: keyof Formulario; label: string; type?: string; full?: boolean }[] = [
  { key: "name", label: "Nombre Completo", full: true },
  { key: "rut", label: "RUT" },
  { key: "email", label: "Email (su acceso al portal)", type: "email" },
  { key: "phone", label: "Teléfono (WhatsApp)" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "marital_status", label: "Estado Civil" },
  { key: "profession", label: "Profesión" },
  { key: "address", label: "Dirección", full: true },
];

export default function CoTitularesCard({
  reservationId,
  coOwners,
  isReadOnly,
  onUpdate,
}: {
  reservationId: string;
  coOwners: any[];
  isReadOnly?: boolean;
  onUpdate: () => void;
}) {
  // null = cerrado, "NEW" = agregando, id = editando ese co-titular
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [claves, setClaves] = useState<Record<string, string>>({});

  const abrirNuevo = () => {
    setForm(VACIO);
    setEditando("NEW");
  };

  const abrirEdicion = (co: any) => {
    setForm({
      name: co.name || "",
      rut: co.rut || "",
      email: co.email || "",
      phone: co.phone || "",
      address: co.address || "",
      marital_status: co.marital_status || "",
      profession: co.profession || "",
      nationality: co.nationality || "",
    });
    setEditando(co.id);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res: any =
        editando === "NEW"
          ? await agregarCoTitular(reservationId, form)
          : await actualizarCoTitular(editando!, { ...form });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editando === "NEW" ? "Co-titular agregado" : "Co-titular actualizado");
      setEditando(null);
      onUpdate();
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (co: any) => {
    if (!confirm(`¿Quitar a ${co.name} como co-titular? Dejará de ver este lote en su portal y de recibir sus avisos.`)) return;
    setOcupado(co.id);
    try {
      const res: any = await quitarCoTitular(co.id);
      if (res?.error) return toast.error(res.error);
      toast.success("Co-titular quitado");
      onUpdate();
    } finally {
      setOcupado(null);
    }
  };

  const enviarAcceso = async (co: any) => {
    if (!confirm(`Se generará una clave temporal para ${co.name} y se le enviará el correo de bienvenida a ${co.email}. ¿Continuar?`)) return;
    setOcupado(co.id);
    try {
      const res: any = await enviarAccesoCoTitular(co.id);
      if (res?.error) return toast.error(res.error);
      setClaves((prev) => ({ ...prev, [co.id]: res.tempPassword }));
      toast.success(`Acceso enviado a ${co.email}`);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <Users className="w-4.5 h-4.5 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Co-titulares</h3>
        </div>
        {!isReadOnly && editando === null && (
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Agregar
          </button>
        )}
      </div>

      {coOwners.length === 0 && editando === null && (
        <p className="text-xs font-semibold text-slate-400">
          Sin co-titulares. Si la promesa la firmaron dos personas, agrega aquí a la segunda: entra al portal con su propio correo y recibe los mismos avisos.
        </p>
      )}

      {coOwners.map((co: any) => (
        <div key={co.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-slate-800">{co.name}</p>
              <p className="font-semibold text-slate-500">
                {co.rut || "Sin RUT"} · {co.email}
              </p>
              <p className="font-semibold text-slate-500">
                {co.phone ? `WhatsApp: ${co.phone}` : "Sin teléfono: no recibe WhatsApp hasta que se agregue"}
              </p>
              {(co.profession || co.marital_status || co.address) && (
                <p className="font-medium text-slate-400">
                  {[co.profession, co.marital_status, co.nationality, co.address].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {!isReadOnly && editando === null && (
              <div className="flex items-center gap-1 shrink-0">
                {ocupado === co.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
                ) : (
                  <>
                    <button onClick={() => enviarAcceso(co)} title="Enviar acceso al portal" className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white cursor-pointer">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => abrirEdicion(co)} title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => quitar(co)} title="Quitar" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {claves[co.id] && (
            <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 font-semibold text-emerald-700">
              Clave temporal: <span className="font-mono">{claves[co.id]}</span> · el sistema le pedirá cambiarla al entrar.
            </p>
          )}
        </div>
      ))}

      {editando !== null && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {CAMPOS.map((c) => (
              <div key={c.key} className={c.full ? "sm:col-span-2 space-y-1" : "space-y-1"}>
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{c.label}</label>
                <input
                  type={c.type || "text"}
                  value={form[c.key]}
                  disabled={c.key === "email" && editando !== "NEW"}
                  onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-brand-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            ))}
          </div>
          {editando !== "NEW" && (
            <p className="text-[9px] font-semibold text-slate-400">
              El correo es su usuario del portal: para cambiarlo, quita al co-titular y agrégalo de nuevo.
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setEditando(null)}
              disabled={guardando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !form.name.trim() || !form.email.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
