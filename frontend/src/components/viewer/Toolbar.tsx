import React from 'react';
import { 
  Pencil,
  Search,
  MousePointer2,
  RefreshCcw,
  ArrowUpRight,
  FlipVertical as FlipVerticalIcon,
  Maximize2, 
  Move, 
  ZoomIn, 
  Ruler, 
  ChevronLeft,
  ChevronRight, 
  Circle, 
  Square, 
  Target, 
  Eraser, 
  Trash2,
  RotateCcw, 
  RotateCw,
  FlipHorizontal, 
  Contrast, 
  LayoutGrid,
  Square as SquareIcon,
  Paintbrush,
  HeartPulse,
  Sun,
  MoveHorizontal,
  IterationCcw
} from 'lucide-react';
import { useViewerStore, ToolName } from '../../store/useViewerStore';
import { cn } from '../../lib/utils';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';

export default function Toolbar() {
  const { 
    activeTool, 
    setActiveTool, 
    layout, 
    setLayout, 
    activeViewportIndex,
    invert,
    setInvert,
    viewportData,
    viewportImageIndices
  } = useViewerStore();

  const currentImageIds = viewportData[activeViewportIndex] || [];
  const currentImageIndex = viewportImageIndices[activeViewportIndex] || 0;

  const handleMobilePrevSlice = () => {
    window.dispatchEvent(new CustomEvent('dicom-viewport-navigate', { 
      detail: { viewportIndex: activeViewportIndex, direction: 'prev' } 
    }));
  };

  const handleMobileNextSlice = () => {
    window.dispatchEvent(new CustomEvent('dicom-viewport-navigate', { 
      detail: { viewportIndex: activeViewportIndex, direction: 'next' } 
    }));
  };

  const tools: { name: ToolName; icon: any; label: string }[] = [
    { name: 'Wwwc', icon: Sun, label: 'W/L (Contrast/Brightness)' },
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
    { name: 'CTR', icon: HeartPulse, label: 'CTR Ratio' },
    { name: 'Eraser', icon: Eraser, label: 'Delete Measurement' },
  ];

  const handleReset = () => {
    const element = document.querySelector(`.viewport-element-${activeViewportIndex}`);
    if (element) {
      try {
        cornerstone.getEnabledElement(element as HTMLElement);
        cornerstone.reset(element as HTMLElement);
      } catch (e) {
        console.warn('Viewport not ready for reset');
      }
    }
  };

  const handleRotate90 = () => {
    const element = document.querySelector(`.viewport-element-${activeViewportIndex}`);
    if (element) {
      try {
        cornerstone.getEnabledElement(element as HTMLElement);
        const viewport = cornerstone.getViewport(element as HTMLElement);
        viewport.rotation = (viewport.rotation + 90) % 360;
        cornerstone.setViewport(element as HTMLElement, viewport);
      } catch (e) {
        console.warn('Viewport not ready for rotate');
      }
    }
  };

  const handleClearAnnotations = () => {
    const element = document.querySelector(`.viewport-element-${activeViewportIndex}`);
    if (element) {
      try {
        cornerstone.getEnabledElement(element as HTMLElement);
        const toolsToClear = [
          'Length', 'Angle', 'EllipticalRoi', 'RectangleRoi', 'FreehandRoi', 'Probe', 'ArrowAnnotate'
        ];
        toolsToClear.forEach(tool => {
          cornerstoneTools.clearToolState(element as HTMLElement, tool);
        });
        cornerstone.updateImage(element as HTMLElement);
      } catch (e) {
        console.warn('Viewport not ready for clearing annotations');
      }
    }
  };

  const handleFlipH = () => {
    const element = document.querySelector(`.viewport-element-${activeViewportIndex}`);
    if (element) {
      try {
        cornerstone.getEnabledElement(element as HTMLElement);
        const viewport = cornerstone.getViewport(element as HTMLElement);
        viewport.hflip = !viewport.hflip;
        cornerstone.setViewport(element as HTMLElement, viewport);
      } catch (e) {
        console.warn('Viewport not ready for horizontal flip');
      }
    }
  };

  const handleFlipV = () => {
    const element = document.querySelector(`.viewport-element-${activeViewportIndex}`);
    if (element) {
      try {
        cornerstone.getEnabledElement(element as HTMLElement);
        const viewport = cornerstone.getViewport(element as HTMLElement);
        viewport.vflip = !viewport.vflip;
        cornerstone.setViewport(element as HTMLElement, viewport);
      } catch (e) {
        console.warn('Viewport not ready for vertical flip');
      }
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full shrink-0">
      <div className="bg-[#0c0c0c] [.theme-teleradiology_&]:bg-white border border-white/10 [.theme-teleradiology_&]:border-slate-300 p-1 rounded-lg flex items-center gap-1 sm:gap-1.5 overflow-x-auto flex-nowrap whitespace-nowrap scrollbar-thin scrollbar-thumb-white/20 [.theme-teleradiology_&]:scrollbar-thumb-slate-400 w-full max-w-full touch-pan-x shadow-lg">
        <div className="flex items-center gap-0.5 sm:gap-1 border-r border-white/10 [.theme-teleradiology_&]:border-slate-300 pr-1.5 sm:pr-2 shrink-0 flex-nowrap">
          {tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => setActiveTool(tool.name)}
              title={tool.label}
              className={cn(
                "p-1.5 rounded-md transition-all shrink-0 cursor-pointer border text-xs",
                activeTool === tool.name 
                  ? "bg-[#967E2B]/10 [.theme-teleradiology_&]:bg-[#967E2B]/25 border-2 border-[#967E2B] text-[#967E2B] [.theme-teleradiology_&]:text-black shadow-sm font-black" 
                  : "bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400"
              )}
            >
              <tool.icon className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 border-r border-white/10 [.theme-teleradiology_&]:border-slate-300 pr-1.5 sm:pr-2 shrink-0 flex-nowrap">
          <button 
            onClick={handleReset}
            title="Reset View"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          </button>
          <button 
            onClick={handleRotate90}
            title="Rotate 90°"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black shrink-0 cursor-pointer"
          >
            <RotateCw className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          </button>
          <button 
            onClick={handleClearAnnotations}
            title="Clear Annotations"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-red-400 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-red-400 shrink-0" />
          </button>
          <button 
            onClick={handleFlipH}
            title="Flip Horizontal"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black shrink-0 cursor-pointer"
          >
            <FlipHorizontal className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          </button>
          <button 
            onClick={handleFlipV}
            title="Flip Vertical"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black shrink-0 cursor-pointer"
          >
            <FlipVerticalIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          </button>
          <button 
            onClick={() => setInvert(!invert)}
            title="Invert"
            className={cn(
              "p-1.5 rounded-md transition-all shrink-0 cursor-pointer border",
              invert 
                ? "bg-[#967E2B]/10 [.theme-teleradiology_&]:bg-[#967E2B]/25 border-2 border-[#967E2B] text-[#967E2B] [.theme-teleradiology_&]:text-black shadow-sm font-black" 
                : "bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400"
            )}
          >
            <Contrast className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-nowrap">
          <button 
            onClick={() => setLayout(layout === '1x1' ? '2x2' : '1x1')}
            title="Toggle Layout"
            className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 hover:border-white/20 [.theme-teleradiology_&]:hover:border-slate-400 hover:text-[#967E2B] [.theme-teleradiology_&]:hover:text-black shrink-0 cursor-pointer"
          >
            {layout === '1x1' ? <LayoutGrid className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" /> : <SquareIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />}
          </button>
        </div>
      </div>

      {/* Mobile-only responsive slice switcher - outside the active viewport */}
      {currentImageIds.length > 1 && (
        <div className="md:hidden flex items-center justify-between w-full bg-[#0c0c0c] [.theme-teleradiology_&]:bg-white border border-white/10 [.theme-teleradiology_&]:border-slate-300 px-3 py-1.5 rounded-lg shrink-0 select-none shadow-lg">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#967E2B] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#967E2B]"></span>
            </span>
            <span className="text-[10px] font-black text-slate-300 [.theme-teleradiology_&]:text-slate-900 uppercase tracking-wider">
              Slice Control
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMobilePrevSlice}
              className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 text-slate-300 [.theme-teleradiology_&]:text-slate-800 transition-all cursor-pointer flex items-center justify-center border border-white/10 [.theme-teleradiology_&]:border-slate-300"
              title="Previous Slice"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-[#967E2B]" />
            </button>
            <span className="text-[11px] font-mono text-[#967E2B] font-black min-w-[50px] text-center bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 px-2 py-0.5 rounded border border-white/10 [.theme-teleradiology_&]:border-slate-300">
              {currentImageIndex + 1} / {currentImageIds.length}
            </span>
            <button
              onClick={handleMobileNextSlice}
              className="p-1.5 rounded-md bg-[#181818] [.theme-teleradiology_&]:bg-slate-100 hover:bg-white/5 [.theme-teleradiology_&]:hover:bg-slate-200 text-slate-300 [.theme-teleradiology_&]:text-slate-800 transition-all cursor-pointer flex items-center justify-center border border-white/10 [.theme-teleradiology_&]:border-slate-300"
              title="Next Slice"
            >
              <ChevronRight className="w-3.5 h-3.5 text-[#967E2B]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
