import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Maximize2, 
  Move, 
  ZoomIn, 
  Ruler, 
  ChevronRight, 
  Circle, 
  Square, 
  Target, 
  Eraser,
  Search,
  ArrowUpRight,
  RefreshCcw,
  Pencil,
  HeartPulse
} from 'lucide-react';
import { ToolName, useViewerStore } from '../../store/useViewerStore';
import { cn } from '../../lib/utils';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const TOOLS: { name: ToolName; icon: any; label: string }[] = [
  { name: 'Wwwc', icon: Maximize2, label: 'Window/Level' },
  { name: 'Pan', icon: Move, label: 'Pan' },
  { name: 'Zoom', icon: ZoomIn, label: 'Zoom' },
  { name: 'Magnify', icon: Search, label: 'Magnify' },
  { name: 'Length', icon: Ruler, label: 'Length' },
  { name: 'Angle', icon: ChevronRight, label: 'Angle' },
  { name: 'ArrowAnnotate', icon: ArrowUpRight, label: 'Arrow' },
  { name: 'EllipticalRoi', icon: Circle, label: 'ROI Circle' },
  { name: 'RectangleRoi', icon: Square, label: 'ROI Rect' },
  { name: 'FreehandRoi', icon: Pencil, label: 'Freehand ROI' },
  { name: 'Probe', icon: Target, label: 'Probe' },
  { name: 'Rotate', icon: RefreshCcw, label: 'Rotate Tool' },
  { name: 'CTR', icon: HeartPulse, label: 'CTR Calculator' },
  { name: 'Eraser', icon: Eraser, label: 'Delete Measurement' },
];

export default function ContextMenu({ x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { activeTool, setActiveTool } = useViewerStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Use capturing phase to ensure we catch it before cornerstone
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [onClose]);

  const handleToolSelect = (toolName: ToolName) => {
    setActiveTool(toolName);
    onClose();
  };

  // Adjust position if menu goes off screen
  const menuWidth = 200;
  const menuHeight = 400; // Estimated
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 20);

  return createPortal(
    <div 
      ref={menuRef}
      style={{ top: adjustedY, left: adjustedX }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[100] w-52 bg-background/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <div className="p-1 px-2 border-b border-white/5 bg-white/5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quick Tools</span>
      </div>
      <div className="p-1 max-h-[70vh] overflow-y-auto">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.name;
          
          return (
            <button
              key={tool.name}
              onClick={() => handleToolSelect(tool.name)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                isActive 
                  ? "bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/20" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className={cn(
                "w-4 h-4 transition-transform group-hover:scale-110",
                isActive ? "text-primary-foreground" : "text-primary"
              )} />
              <span>{tool.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
