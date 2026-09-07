"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  EMAIL_VARIABLE_CATEGORIES,
  EMAIL_TEMPLATE_VARIABLES,
  type EmailVariableCategory,
} from "@/lib/emailTemplate";
import { cn } from "@/lib/utils";

interface EmailVariableSelectorProps {
  onInsert: (variableKey: string) => void;
  disabled?: boolean;
}

export default function EmailVariableSelector({
  onInsert,
  disabled = false,
}: EmailVariableSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<EmailVariableCategory | "ALL">("ALL");
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const filteredVariables =
    selectedCategory === "ALL"
      ? EMAIL_TEMPLATE_VARIABLES
      : EMAIL_TEMPLATE_VARIABLES.filter((v) => v.category === selectedCategory);

  return (
    <div className="space-y-3 bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            Metacampos dinámicos
          </span>
          <span className="text-[10px] font-semibold text-slate-400">
            (Haz clic para insertar en el texto)
          </span>
        </div>

        {/* Filtros por Categoría */}
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={cn(
              "px-2 py-0.5 rounded-md transition-all cursor-pointer",
              selectedCategory === "ALL"
                ? "bg-slate-800 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Todos ({EMAIL_TEMPLATE_VARIABLES.length})
          </button>
          {EMAIL_VARIABLE_CATEGORIES.map((cat) => {
            const count = EMAIL_TEMPLATE_VARIABLES.filter((v) => v.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1",
                  selectedCategory === cat.id
                    ? "bg-brand-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className="opacity-70 text-[9px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de Pills de Variables con Tooltips interactivos */}
      <div className="flex flex-wrap gap-1.5">
        {filteredVariables.map((v) => {
          const isTooltipOpen = activeTooltip === v.key;

          return (
            <div key={v.key} className="relative group">
              <div
                className={cn(
                  "flex items-center rounded-lg border text-[11px] font-mono transition-all shadow-xs",
                  v.category === "CLIENTE" && "bg-blue-50/50 border-blue-200/80 text-blue-800 hover:border-blue-400",
                  v.category === "TERRENO" && "bg-emerald-50/50 border-emerald-200/80 text-emerald-800 hover:border-emerald-400",
                  v.category === "FINANCIERO" && "bg-amber-50/50 border-amber-200/80 text-amber-800 hover:border-amber-400"
                )}
              >
                {/* Botón para insertar la variable */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInsert(v.key)}
                  className="px-2 py-1 font-semibold hover:bg-black/5 rounded-l-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  title={`Insertar ${v.key}`}
                >
                  <span className="font-bold">{v.key}</span>
                  <span className="text-[9px] font-sans font-medium text-slate-500">({v.label})</span>
                </button>

                {/* Botón de Ayuda (?) / Tooltip */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(isTooltipOpen ? null : v.key);
                  }}
                  onMouseEnter={() => setActiveTooltip(v.key)}
                  onMouseLeave={() => setActiveTooltip((current) => (current === v.key ? null : current))}
                  className="px-1.5 py-1 border-l border-inherit hover:bg-black/10 rounded-r-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  aria-label={`Información sobre ${v.key}`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Popover / Tooltip flotante explicativo */}
              {isTooltipOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-900 text-white rounded-xl p-3 shadow-xl z-50 text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150"
                  style={{ minWidth: "220px" }}
                >
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700/80">
                    <span className="font-mono text-xs font-bold text-amber-300">{v.key}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {v.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-200 leading-snug mb-2 font-sans font-normal">
                    {v.description}
                  </p>
                  <div className="bg-slate-800/90 rounded-md p-1.5 text-[10px] font-sans">
                    <span className="text-slate-400 font-bold block mb-0.5">Ejemplo en correo:</span>
                    <span className="text-emerald-300 font-mono font-medium">{v.example}</span>
                  </div>
                  {/* Flecha del tooltip */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
