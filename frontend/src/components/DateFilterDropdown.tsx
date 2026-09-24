import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export type DateFilterValue = 'all' | 'today' | 'yesterday' | 'week' | '7d' | '30d' | 'custom';

interface Option {
  value: DateFilterValue;
  label: string;
}

interface DateFilterDropdownProps {
  value: DateFilterValue;
  onChange: (value: any) => void;
  options?: Option[];
  className?: string;
}

const DEFAULT_OPTIONS: Option[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 Days' }
];

export default function DateFilterDropdown({ 
  value, 
  onChange, 
  options = DEFAULT_OPTIONS,
  className 
}: DateFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn("relative z-50", className)} ref={dropdownRef}>
      <button
        id="date-filter-button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all min-w-[140px] justify-between border shadow-xl relative z-50",
          isOpen 
            ? "bg-primary text-black border-primary ring-2 ring-primary/20" 
            : "bg-white/10 hover:bg-white/15 border-white/10 text-main"
        )}
      >
        <div className="flex items-center gap-2">
          <Calendar className={cn("w-3.5 h-3.5", isOpen ? "text-black" : "text-primary")} />
          <span>{selectedOption.label}</span>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen ? "rotate-180 text-black" : "text-muted")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "circOut" }}
            className="absolute right-0 top-full mt-2 w-full min-w-[180px] border border-white/20 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[1000] p-1.5 bg-[var(--dropdown-bg)] backdrop-blur-none"
            style={{ opacity: 1 }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg transition-all",
                    isSelected 
                      ? "bg-primary text-black font-bold" 
                      : "text-muted hover:bg-white/5 hover:text-main"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
