"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData, updateClientProfile, updateClientFinancials } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import { Loader2, Search, User, Mail, ChevronRight, MapPin, Hash, Target, Phone, Users, X, Calendar, DollarSign, Activity, FileText, AlertTriangle, CheckCircle2, Save, Edit3 } from "lucide-react";

export default function ClientsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMsg, setEditMsg] = useState({ text: "", type: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", rut: "", phone: "" });
  
  // Financial Edit State
  const [isEditingFin, setIsEditingFin] = useState(false);
  const [isSavingFin, setIsSavingFin] = useState(false);
  const [editFinMsg, setEditFinMsg] = useState({ text: "", type: "" });
  const [finForm, setFinForm] = useState({
    price_total_clp: 0,
    reservation_price: 0,
    pie: 0,
    cuotas: 0,
    valor_cuota: 0,
    last_installment_value: 0,
    installments_paid: 0,
    daily_penalty: 0,
    due_day: 5,
    grace_days: 5,
    mora_frozen: false,
    debt_start_date: "",
    next_payment_date: "",
    installment_start_date: ""
  });

  const itemsPerPage = 10;

  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
        setSelectedProject(result.projects[0].slug);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setLoading(true);
      getFullPostventaData({ projectSlug: selectedProject }).then((result) => {
        setData(result);
        setLoading(false);
      });
    }
  }, [selectedProject]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStage, selectedProject]);

  const rawClients = data?.data || [];
  const uniqueStages: string[] = Array.from(new Set(rawClients.map((c: any) => c.lotStage).filter(Boolean)));
  
  const stageCounts = uniqueStages.reduce((acc: any, stage: string) => {
    acc[stage] = rawClients.filter((c: any) => c.lotStage === stage).length;
    return acc;
  }, {});

  const filteredClients = rawClients.filter((c: any) => {
    const matchesSearch = !search ||
      c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      c.clientEmail?.toLowerCase().includes(search.toLowerCase()) ||
      c.lotNumber?.toString().toUpperCase().includes(search.toUpperCase());
    
    // lotStage is stored in DB. Could be undefined occasionally for Lomas.
    const matchesStage = selectedStage === "ALL" || (c.lotStage && c.lotStage.toString().toUpperCase() === selectedStage.toUpperCase());
    
    return matchesSearch && matchesStage;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">Database & CRM</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Directorio <span className="text-white/20">Clientes</span>
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="BUSCAR EXPEDIENTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-blue-400/40 focus:ring-1 focus:ring-blue-400/20 transition-all"
            />
          </div>
          
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs and Counts */}
      {!loading && rawClients.length > 0 && uniqueStages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 animate-fade-in">
          <button
            onClick={() => setSelectedStage("ALL")}
            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === "ALL" ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
          >
            Todos ({rawClients.length})
          </button>
          {uniqueStages.map((stage) => (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === stage.toString().toUpperCase() || selectedStage === stage ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              Etapa {stage} ({stageCounts[stage]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Base de Datos...</p>
        </div>
      ) : (
        <div className="rounded-[3rem] overflow-hidden border border-white/5 glass-card animate-slide-up">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Expediente Cliente</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">Propiedad</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Salud Financiera</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Cierre Contractual</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-right">Saldo Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedClients.map((c: any) => (
                  <tr 
                    key={c.id} 
                    onClick={() => {
                      setSelectedClient(c);
                      setIsEditing(false);
                      setIsEditingFin(false);
                      setEditMsg({ text: "", type: "" });
                      setEditFinMsg({ text: "", type: "" });
                      setEditForm({
                        name: c.clientName || "",
                        email: c.clientEmail || "",
                        rut: c.rut || "",
                        phone: c.clientPhone || ""
                      });
                      setFinForm({
                        price_total_clp: c.totalToPay || 0,
                        reservation_price: c.reservation_price || 0,
                        pie: c.pie || 0,
                        cuotas: c.totalCuotas || 0,
                        valor_cuota: c.valor_cuota || 0,
                        last_installment_value: c.last_installment_value || c.valor_cuota || 0,
                        installments_paid: c.paidCuotas || 0,
                        daily_penalty: c.daily_penalty || 10000,
                        due_day: c.due_day || 5,
                        grace_days: c.grace_days || 5,
                        mora_status: c.mora_status || (c.mora_frozen ? "CONGELADO" : "ACTIVO"),
                        debt_start_date: c.debt_start_date ? new Date(c.debt_start_date).toISOString().split('T')[0] : "",
                        next_payment_date: c.nextDueDate ? new Date(c.nextDueDate).toISOString().split('T')[0] : "",
                        installment_start_date: c.installment_start_date ? new Date(c.installment_start_date).toISOString().split('T')[0] : ""
                      });
                    }}
                    className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-blue-400 group-hover:text-[#061010] group-hover:shadow-[0_0_20px_rgba(96,165,250,0.4)] transition-all duration-500">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-black text-white italic tracking-tighter group-hover:text-blue-400 transition-colors truncate uppercase leading-none mb-1">{c.clientName}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{c.rut || "SIN RUT"}</span>
                            <div className="w-1 h-1 rounded-full bg-white/5" />
                            <span className="text-[10px] font-bold text-white/20 lowercase tracking-tight opacity-40 group-hover:opacity-80 transition-opacity">{c.clientEmail}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex flex-col items-center">
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/40 transition-colors">
                          <Hash className="w-3.5 h-3.5 text-accent" />
                          <span className="text-xs font-black text-white">Lote {c.lotNumber}</span>
                        </div>
                        {c.lotStage && <p className="text-[9px] font-black text-white/20 mt-2 uppercase tracking-widest">Etapa {c.lotStage}</p>}
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="space-y-3 min-w-[160px]">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="opacity-20">{c.paidCuotas}/{c.totalCuotas} Cuotas</span>
                          <span className="text-accent">{Math.round((c.paidCuotas / c.totalCuotas) * 100)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                          <div 
                            className="h-full bg-accent group-hover:brightness-125 transition-all duration-1000" 
                            style={{ 
                              width: `${(c.paidCuotas / c.totalCuotas) * 100}%`,
                              boxShadow: "0 0 15px rgba(212,168,75,0.4)"
                            }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div
                        className={`
                          inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-widest border
                          ${c.status === "LATE" ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : c.status === "FROZEN" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : c.status === "GRACE" ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : c.status === "UPCOMING" ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                        `}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ 
                          background: c.status === "LATE" ? "#f87171" 
                            : c.status === "FROZEN" ? "#60a5fa"
                            : c.status === "GRACE" ? "var(--warning)" 
                            : "var(--success)" 
                        }} />
                        {c.status === "LATE" ? "MORA" 
                          : c.status === "FROZEN" ? "CONGELADO"
                          : c.status === "GRACE" ? "GRACIA" 
                          : c.status === "UPCOMING" ? "AVISO" 
                          : "AL DÍA"}
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <p className="text-xl font-black text-white italic tracking-tighter group-hover:text-accent transition-colors">{formatCLP(c.pendingBalance)}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-1">SVALOR ESTIMADO</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {paginatedClients.length === 0 && (
            <div className="text-center py-40 flex flex-col items-center justify-center">
              <Target className="w-16 h-16 mb-6 opacity-5" />
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Búsqueda sin resultados en este proyecto</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-white/5 bg-white/[0.02] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                Mostrando página <span className="text-accent">{currentPage}</span> de <span className="text-white/60">{totalPages}</span>
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${currentPage === page ? "bg-accent/20 text-accent border border-accent/40 shadow-[0_0_10px_rgba(212,168,75,0.2)]" : "text-white/40 hover:text-white/80 hover:bg-white/5"}`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Cliente */}
      {selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => setSelectedClient(null)}>
          <div className="bg-[#050C0C] border border-white/10 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Header del Modal */}
            <div className="sticky top-0 z-10 bg-[#050C0C]/90 backdrop-blur px-8 py-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">{selectedClient.clientName}</h2>
                  <p className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mt-1">{selectedClient.rut || "SIN RUT"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {(!selectedClient.rut || !selectedClient.clientPhone || selectedClient.clientEmail?.includes("@libertadyalegria")) && !isEditing && (
                  <div className="hidden sm:flex bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] uppercase font-black tracking-widest px-4 py-2 rounded-xl items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Faltan Datos Clave
                  </div>
                )}
                <button 
                  onClick={() => setSelectedClient(null)}
                  className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 focus:outline-none transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 outline-none">
              
              {/* Columna Izquierda: Contacto & Estado */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><Mail className="w-3 h-3"/> Contacto</h3>
                    {!isEditing && (
                      <button onClick={() => setIsEditing(true)} className="text-[10px] uppercase font-black tracking-widest text-accent hover:text-white transition-colors flex items-center gap-1.5 bg-accent/10 px-3 py-1.5 rounded-lg">
                        <Edit3 className="w-3 h-3" /> Editar
                      </button>
                    )}
                  </div>
                  
                  {isEditing ? (
                    <div className="bg-white/[0.02] border border-accent/30 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(212,168,75,0.05)]">
                      <div className="space-y-3">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Nombre Completo</label>
                        <input type="text" value={editForm.name} onChange={e=>setEditForm({...editForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-3">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">RUT Registrado</label>
                        <input type="text" value={editForm.rut} onChange={e=>setEditForm({...editForm, rut: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-3">
                        <label className="block flex items-center justify-between text-[9px] text-white/40 uppercase font-black tracking-widest">
                          Correo / Usuario 
                          {editForm.email.includes("@libertadyalegria") && <span className="text-red-400">Temporal</span>}
                        </label>
                        <input type="email" value={editForm.email} onChange={e=>setEditForm({...editForm, email: e.target.value})} className={`w-full bg-black/40 border rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold ${editForm.email.includes("@libertadyalegria") ? "border-red-500/40" : "border-white/10"}`} />
                      </div>
                      <div className="space-y-3">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Teléfono de Contacto</label>
                        <input type="text" value={editForm.phone} onChange={e=>setEditForm({...editForm, phone: e.target.value})} className={`w-full bg-black/40 border rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold ${!editForm.phone ? "border-orange-500/40" : "border-white/10"}`} />
                      </div>

                      {editMsg.text && (
                        <div className={`text-[10px] font-black uppercase tracking-widest p-3 rounded-xl border ${editMsg.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                          {editMsg.text}
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => {setIsEditing(false); setEditMsg({text:"",type:""});}} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 transition-colors">Cancelar</button>
                        <button 
                          onClick={async () => {
                            setIsSaving(true);
                            setEditMsg({ text: "", type: "" });
                            try {
                              const res = await updateClientProfile(selectedClient.id, editForm);
                              if (res.error) {
                                setEditMsg({ text: res.error, type: "error" });
                              } else {
                                setEditMsg({ text: "Datos actualizados. Cerrando...", type: "success" });
                                setTimeout(() => {
                                  setSelectedClient(null); // Close modal on success to refresh cleanly
                                  setIsEditing(false);
                                }, 1500);
                              }
                            } catch(e) {
                              setEditMsg({ text: "Error de servidor.", type: "error" });
                            }
                            setIsSaving(false);
                          }}
                          disabled={isSaving}
                          className="flex-1 px-4 py-3 rounded-xl bg-accent text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-4">
                      <div>
                        <p className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1 flex items-center justify-between">
                          Correo Electrónico
                          {selectedClient.clientEmail?.includes("@libertadyalegria") && <span className="text-red-400">CORREO TEMPORAL CREADO POR SISTEMA</span>}
                        </p>
                        <p className={`text-sm font-bold ${selectedClient.clientEmail?.includes("@libertadyalegria") ? "text-red-300" : "text-white/80"}`}>{selectedClient.clientEmail}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1 flex items-center justify-between">
                          Teléfono
                          {!selectedClient.clientPhone && <span className="text-orange-400">FALTA TELÉFONO</span>}
                        </p>
                        <p className={`text-sm font-bold ${!selectedClient.clientPhone ? "text-orange-300 italic" : "text-white/80"}`}>{selectedClient.clientPhone || "No registrado"}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><MapPin className="w-3 h-3"/> Propiedad Asignada</h3>
                  <div className="bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="inline-block px-3 py-1 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-widest mb-2">
                          LOTE {selectedClient.lotNumber}
                        </span>
                        <p className="text-xl font-black text-white">{formatCLP(selectedClient.totalToPay)}</p>
                        <p className="text-[10px] uppercase font-black text-white/40 mt-1">Valor Venta</p>
                      </div>
                      <Hash className="w-10 h-10 text-accent/20" />
                    </div>
                    {selectedClient.lotStage && (
                      <div className="flex items-center gap-4 text-xs font-bold text-white/60">
                        <span className="uppercase tracking-widest opacity-80">Etapa {selectedClient.lotStage}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Finanzas */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><DollarSign className="w-3 h-3"/> Finanzas & Saldos</h3>
                    {!isEditingFin && (
                      <button onClick={() => setIsEditingFin(true)} className="text-[10px] uppercase font-black tracking-widest text-accent hover:text-white transition-colors flex items-center gap-1.5 bg-accent/10 px-3 py-1.5 rounded-lg">
                        <Edit3 className="w-3 h-3" /> Configuración Financiera
                      </button>
                    )}
                  </div>
                  
                  {isEditingFin ? (
                    <div className="bg-white/[0.02] border border-accent/30 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(212,168,75,0.05)]">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Valor Terreno Total</label>
                          <input type="number" value={finForm.price_total_clp} onChange={e=>setFinForm({...finForm, price_total_clp: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Valor Reserva Inicial</label>
                          <input type="number" value={finForm.reservation_price} onChange={e=>setFinForm({...finForm, reservation_price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Valor Pie Pagado</label>
                          <input type="number" value={finForm.pie} onChange={e=>setFinForm({...finForm, pie: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Total Cuotas a Pagar</label>
                          <input type="number" value={finForm.cuotas} onChange={e=>setFinForm({...finForm, cuotas: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Valor Cuota Normal</label>
                          <input type="number" value={finForm.valor_cuota} onChange={e=>setFinForm({...finForm, valor_cuota: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Valor Última Cuota</label>
                          <input type="number" value={finForm.last_installment_value} onChange={e=>setFinForm({...finForm, last_installment_value: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                        </div>
                      </div>

                      <div className="border-t border-white/10 pt-4 mt-2">
                        <p className="text-[10px] font-black uppercase text-white/40 tracking-widest mb-3">Progreso de Calendario</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Fecha Inicio de Cuota 1</label>
                            <input type="date" value={finForm.installment_start_date} onChange={e=>setFinForm({...finForm, installment_start_date: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Cuota Actual Pagada</label>
                            <input type="number" value={finForm.installments_paid} onChange={e=>setFinForm({...finForm, installments_paid: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Interés Multa x Día ($)</label>
                            <input type="number" value={finForm.daily_penalty} onChange={e=>setFinForm({...finForm, daily_penalty: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                          </div>
                        </div>

                        <div className="pt-4 mt-4 border-t border-white/5">
                          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Vencimientos & Mora</p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest font-black italic">Fecha Próximo Vencimiento</label>
                              <input type="date" value={finForm.next_payment_date} onChange={e=>setFinForm({...finForm, next_payment_date: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                            </div>
                            <div className="space-y-2">
                              <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest">Días de Gracia</label>
                              <input type="number" min="0" value={finForm.grace_days} onChange={e=>setFinForm({...finForm, grace_days: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                            </div>
                          </div>
                          
                          {/* Financial Status Dropdown */}
                          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 mb-6 mt-4">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-accent mb-1">CÁLCULO DE MULTAS</p>
                                <p className="text-[9px] text-white/40 uppercase font-bold">Estado financiero manual</p>
                              </div>
                              <select 
                                value={finForm.mora_status}
                                onChange={(e) => setFinForm({...finForm, mora_status: e.target.value})}
                                className={`
                                  px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none border cursor-pointer transition-all
                                  ${finForm.mora_status === "ACTIVO" ? "bg-red-500/20 text-red-400 border-red-500/40" 
                                    : finForm.mora_status === "AL_DIA" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                    : "bg-blue-500/20 text-blue-400 border-blue-500/40"}
                                `}
                              >
                                <option value="ACTIVO" className="bg-[#0c1a1a] text-red-400">ACTIVO (CON MORA)</option>
                                <option value="AL_DIA" className="bg-[#0c1a1a] text-emerald-400">AL DÍA (SIN MORA)</option>
                                <option value="CONGELADO" className="bg-[#0c1a1a] text-blue-400">CONGELADO (PAUSADO)</option>
                              </select>
                            </div>
                          </div>

                          {!finForm.mora_frozen && (
                            <div className="mt-4 space-y-2">
                              <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest font-black italic">Fecha Inicio de Deuda (Opcional - Fuerza Mora)</label>
                              <input type="date" value={finForm.debt_start_date} onChange={e=>setFinForm({...finForm, debt_start_date: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-accent outline-none font-bold" />
                            </div>
                          )}
                        </div>
                      </div>

                      {editFinMsg.text && (
                        <div className={`mt-2 text-[10px] font-black uppercase tracking-widest p-3 rounded-xl border ${editFinMsg.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                          {editFinMsg.text}
                        </div>
                      )}

                      <div className="flex gap-3 pt-4">
                        <button onClick={() => {setIsEditingFin(false); setEditFinMsg({text:"",type:""});}} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 transition-colors">Descartar Cambios</button>
                        <button 
                          onClick={async () => {
                            setIsSavingFin(true);
                            setEditFinMsg({ text: "", type: "" });
                            try {
                              const res = await updateClientFinancials(selectedClient.id, selectedClient.lotId, finForm);
                              if (res.error) {
                                setEditFinMsg({ text: res.error, type: "error" });
                              } else {
                                setEditFinMsg({ text: "Estructura Pactada Actualizada Exitosamente.", type: "success" });
                                setTimeout(() => {
                                  setSelectedClient(null); 
                                  setIsEditingFin(false);
                                }, 1500);
                              }
                            } catch(e) {
                              setEditFinMsg({ text: "Error procesando recálculo en servidor.", type: "error" });
                            }
                            setIsSavingFin(false);
                          }}
                          disabled={isSavingFin}
                          className="flex-1 px-4 py-3 rounded-xl bg-accent text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isSavingFin ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                          Recalibrar Finanzas
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-6">
                      <div className="flex justify-between items-end border-b border-white/5 pb-4">
                        <div>
                          <p className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Saldo Pendiente</p>
                          <p className="text-2xl font-black text-white">{formatCLP(selectedClient.pendingBalance)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Total Pagado</p>
                          <p className="text-sm font-bold text-emerald-400">{formatCLP(selectedClient.totalPaid)}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest">
                          <span className="text-white/40">Progreso Cuotas</span>
                          <span className="text-accent">{selectedClient.paidCuotas} / {selectedClient.totalCuotas}</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                          <div className="h-full bg-accent" style={{ width: `${(selectedClient.totalCuotas > 0) ? (selectedClient.paidCuotas / selectedClient.totalCuotas) * 100 : 0}%` }} />
                        </div>
                        <div className="flex justify-between w-full pt-1">
                           <p className="text-[10px] text-white/30 uppercase font-black">
                            Pie: {formatCLP(selectedClient.pieAmount)}
                          </p>
                          <p className="text-[10px] text-white/30 uppercase font-black">
                            Cuota Base: {formatCLP(selectedClient.valor_cuota)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2"><Activity className="w-3 h-3"/> Estado Operativo</h3>
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                    <div className="flex items-center gap-4 mb-5">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${selectedClient.status === "LATE" ? "bg-red-500" : selectedClient.status === "FROZEN" ? "bg-blue-500" : selectedClient.status === "GRACE" ? "bg-orange-500" : selectedClient.status === "UPCOMING" ? "bg-indigo-500" : "bg-emerald-500"}`} />
                      <p className={`text-sm font-black uppercase tracking-widest ${selectedClient.status === "LATE" ? "text-red-400" : selectedClient.status === "FROZEN" ? "text-blue-400" : selectedClient.status === "GRACE" ? "text-orange-400" : selectedClient.status === "UPCOMING" ? "text-indigo-400" : "text-emerald-400"}`}>
                        {selectedClient.status === "LATE" ? "En Mora" : selectedClient.status === "FROZEN" ? "Mora Congelada" : selectedClient.status === "GRACE" ? "Periodo de Gracia" : selectedClient.status === "UPCOMING" ? "Aviso Próximo" : "Al Día"}
                      </p>
                    </div>
                    {selectedClient.status === "LATE" && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-2">
                        <p className="text-xs text-red-300 font-bold mb-1">Atraso Contable: {selectedClient.lateDays} Días</p>
                        <p className="text-[10px] uppercase text-red-400/80 font-black tracking-widest">Multa Vigente: {formatCLP(selectedClient.penaltyAmount)}</p>
                      </div>
                    )}
                    {selectedClient.nextDueDate && (
                      <div className="mt-5 pt-5 border-t border-white/5 flex justify-between items-center">
                        <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">Próximo Cierre</p>
                        <p className="text-xs font-bold text-white/80 flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-accent" />
                          {formatDate(selectedClient.nextDueDate)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
