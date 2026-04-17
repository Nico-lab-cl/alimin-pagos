"use client";

import * as React from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  date?: string | Date | null;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
}

export function DatePicker({ date, onChange, label, className }: DatePickerProps) {
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

  const handleSelect = (day: Date) => {
    // Format to YYYY-MM-DD for standard input values
    const formatted = format(day, "yyyy-MM-dd");
    onChange(formatted);
    setIsOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-[8px] text-white/40 uppercase font-black tracking-widest italic">
          {label}
        </label>
      )}
      
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <button
            className={cn(
              "w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none font-bold transition-all hover:bg-white/5",
              !date && "text-white/20"
            )}
          >
            <span>{date ? format(parseLocalDate(date), "PPP", { locale: es }) : "Seleccionar fecha"}</span>
            <CalendarIcon className="w-4 h-4 text-accent/60" />
          </button>
        </Popover.Trigger>
        
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            className="z-[200] w-[320px] bg-[#0A1110] border border-white/10 rounded-3xl p-5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-black text-white uppercase tracking-widest italic">
                {format(currentMonth, "MMMM yyyy", { locale: es })}
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                <div key={day} className="text-center text-[8px] font-black text-white/20 uppercase tracking-widest">
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
                      !isCurrentMonth && "text-white/10 opacity-20 hover:opacity-100",
                      isCurrentMonth && !isSelected && "text-white/60 hover:bg-white/5 hover:text-white",
                      isSelected && "bg-accent text-[#061010] shadow-[0_0_15px_rgba(212,168,75,0.3)]",
                      isTdy && !isSelected && "border border-accent/30 text-accent font-black"
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
            
            <Popover.Arrow className="fill-[#0A1110] border-white/10" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
