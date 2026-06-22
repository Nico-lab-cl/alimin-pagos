"use client";

import * as React from "react";
import { format, addMonths, subMonths, addYears, subYears, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  date?: string | Date | null;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
  lightMode?: boolean;
}

export function DatePicker({ date, onChange, label, className, lightMode = false }: DatePickerProps) {
  // Helper to parse YYYY-MM-DD string as local date to avoid timezone shifts
  const parseLocalDate = (dateStr: string | Date | null | undefined): Date => {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date(dateStr);
    return new Date(year, month - 1, day);
  };

  const initialDate = React.useMemo(() => parseLocalDate(date), [date]);
  const [currentMonth, setCurrentMonth] = React.useState(initialDate);
  const selectedDate = date ? parseLocalDate(date) : null;
  const [isOpen, setIsOpen] = React.useState(false);

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handlePrevYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(subYears(currentMonth, 1));
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(addYears(currentMonth, 1));
  };

  const handleSelect = (day: Date) => {
    // Format to YYYY-MM-DD for standard input values
    const formatted = format(day, "yyyy-MM-dd");
    onChange(formatted);
    setIsOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className={cn(
          "block text-[8px] uppercase font-black tracking-widest italic",
          lightMode ? "text-slate-400 font-bold" : "text-white/40"
        )}>
          {label}
        </label>
      )}
      
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <div className="relative w-full">
            <button
              type="button"
              className={cn(
                "w-full flex items-center justify-between rounded-xl pl-4 pr-10 py-2.5 text-sm outline-none font-bold transition-all text-left border",
                lightMode
                  ? "bg-white border-slate-200 text-slate-800 hover:bg-slate-50 focus:border-blue-500"
                  : "bg-black/40 border-white/10 text-white hover:bg-white/5 focus:border-accent",
                !date && (lightMode ? "text-slate-400" : "text-white/20")
              )}
            >
              <span>{date ? format(parseLocalDate(date), "PPP", { locale: es }) : "Seleccionar fecha"}</span>
            </button>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
              {date && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }}
                  className={cn(
                    "p-1 rounded-lg transition-all cursor-pointer flex items-center justify-center",
                    lightMode ? "text-slate-400 hover:text-red-500 hover:bg-slate-100" : "text-white/40 hover:text-red-400 hover:bg-white/10"
                  )}
                  title="Limpiar fecha"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <CalendarIcon className={cn(
                "w-4 h-4 pointer-events-none",
                lightMode ? "text-slate-400" : "text-accent/60"
              )} />
            </div>
          </div>
        </Popover.Trigger>
        
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            className={cn(
              "z-[200] w-[320px] rounded-3xl p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 border",
              lightMode
                ? "bg-white border-slate-200"
                : "bg-[#0A1110] border-white/10 backdrop-blur-xl"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className={cn(
                "text-sm font-black uppercase tracking-widest italic",
                lightMode ? "text-slate-800 font-bold" : "text-white"
              )}>
                {format(currentMonth, "MMMM yyyy", { locale: es })}
              </h2>
              <div className="flex gap-0.5">
                <button
                  onClick={handlePrevYear}
                  title="Año Anterior"
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    lightMode ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-white/20 hover:text-white hover:bg-white/5"
                  )}
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handlePrevMonth}
                  title="Mes Anterior"
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    lightMode ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-white/20 hover:text-white hover:bg-white/5"
                  )}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleNextMonth}
                  title="Siguiente Mes"
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    lightMode ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-white/20 hover:text-white hover:bg-white/5"
                  )}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleNextYear}
                  title="Siguiente Año"
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    lightMode ? "text-slate-400 hover:text-slate-800 hover:bg-slate-100" : "text-white/20 hover:text-white hover:bg-white/5"
                  )}
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                <div key={day} className={cn(
                  "text-center text-[8px] font-black uppercase tracking-widest",
                  lightMode ? "text-slate-400" : "text-white/20"
                )}>
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isTdy = isToday(day);

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(day)}
                    className={cn(
                      "h-9 rounded-xl text-xs font-bold transition-all relative flex items-center justify-center",
                      !isCurrentMonth && (lightMode ? "text-slate-300 opacity-40 hover:opacity-100" : "text-white/10 opacity-20 hover:opacity-100"),
                      isCurrentMonth && !isSelected && (lightMode ? "text-slate-700 hover:bg-slate-100" : "text-white/60 hover:bg-white/5 hover:text-white"),
                      isSelected && (
                        lightMode 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "bg-accent text-[#061010] shadow-[0_0_15px_rgba(212,168,75,0.3)]"
                      ),
                      isTdy && !isSelected && (
                        lightMode 
                          ? "border border-blue-200 text-blue-600 font-bold" 
                          : "border border-accent/30 text-accent font-black"
                      )
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
            
            <Popover.Arrow className={cn(
              lightMode ? "fill-white border-slate-200" : "fill-[#0A1110]"
            )} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
