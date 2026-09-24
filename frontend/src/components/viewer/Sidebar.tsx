import React, { useState } from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import { cn } from '../../lib/utils';
import { FileUp, Database, Image as ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { parseDicomFiles } from '../../lib/dicom/parser';
import { motion, AnimatePresence } from 'motion/react';

export default function Sidebar() {
  const { 
    series, 
    addSeries, 
    selectedSeriesId, 
    setSelectedSeriesId, 
    activeViewportIndex,
    setViewportData 
  } = useViewerStore();

  const [isSeriesCollapsed, setIsSeriesCollapsed] = useState(false);
  const [isGalleryCollapsed, setIsGalleryCollapsed] = useState(false);

  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const parsedSeries = await parseDicomFiles(e.target.files);
      parsedSeries.forEach(s => addSeries(s));
      if (parsedSeries.length > 0 && !selectedSeriesId) {
        setSelectedSeriesId(parsedSeries[0].id);
      }
    }
  };

  const handleImageSelect = (imageId: string) => {
    // Load this specific image into the active viewport
    setViewportData(activeViewportIndex, [imageId]);
  };

  return (
    <div className="w-80 h-full glass-panel flex flex-col min-h-0">
      <div className="p-4 border-b border-white/10">
        <label className="glass-btn bg-primary text-black font-bold w-full flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/80 transition-all">
          <FileUp className="w-4 h-4" />
          <span>Load DICOM</span>
          <input 
            type="file" 
            multiple 
            className="hidden" 
            onChange={handleFileUpload}
            accept=".dcm,.dicom,.zip"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Series List */}
        <section className="space-y-3">
          <button 
            onClick={() => setIsSeriesCollapsed(!isSeriesCollapsed)}
            className="flex items-center justify-between w-full group"
          >
            <div className="flex items-center gap-2 text-xs font-black text-white [.theme-teleradiology_&]:text-black uppercase tracking-wider group-hover:opacity-80 transition-opacity">
              <Database className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black" />
              <span>Series List</span>
            </div>
            {isSeriesCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black group-hover:opacity-80 transition-opacity" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black group-hover:opacity-80 transition-opacity" />
            )}
          </button>

          <AnimatePresence initial={false}>
            {!isSeriesCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                {series.length === 0 ? (
                  <div className="text-center py-4 text-white [.theme-teleradiology_&]:text-slate-700 text-sm italic font-medium">
                    No series loaded
                  </div>
                ) : (
                  <div className="space-y-2 pb-1">
                    {series.map((s, idx) => (
                      <div
                        key={`${s.id}-${idx}`}
                        onClick={() => {
                          setSelectedSeriesId(s.id);
                          setViewportData(activeViewportIndex, s.imageIds);
                        }}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer group shadow-sm",
                          selectedSeriesId === s.id 
                            ? "bg-[#967E2B]/20 border-2 border-[#967E2B] text-white [.theme-teleradiology_&]:bg-[#967E2B]/15 [.theme-teleradiology_&]:text-black" 
                            : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-white [.theme-teleradiology_&]:bg-slate-50 [.theme-teleradiology_&]:border-slate-200 [.theme-teleradiology_&]:hover:bg-slate-100 [.theme-teleradiology_&]:text-black"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black text-white [.theme-teleradiology_&]:text-black uppercase">{s.modality}</span>
                          <span className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-800 font-bold">{s.date}</span>
                        </div>
                        <p className="text-sm font-black text-white [.theme-teleradiology_&]:text-black truncate transition-colors">
                          {s.name}
                        </p>
                        <div className="mt-1 text-[10px] text-white [.theme-teleradiology_&]:text-slate-700 font-semibold">
                          {s.imageIds.length} images
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Thumbnail Gallery */}
        {selectedSeries && (
          <section className="space-y-3">
            <button 
              onClick={() => setIsGalleryCollapsed(!isGalleryCollapsed)}
              className="flex items-center justify-between w-full group"
            >
              <div className="flex items-center gap-2 text-xs font-black text-white [.theme-teleradiology_&]:text-black uppercase tracking-wider group-hover:opacity-80 transition-opacity">
                <ImageIcon className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black" />
                <span>Image Gallery</span>
              </div>
              {isGalleryCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black group-hover:opacity-80 transition-opacity" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-black group-hover:opacity-80 transition-opacity" />
              )}
            </button>
            
            <AnimatePresence initial={false}>
              {!isGalleryCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-2 pb-1">
                    {selectedSeries.imageIds.map((id, idx) => (
                      <div
                        key={`img-${id}-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImageSelect(id);
                        }}
                        className="aspect-square bg-black border border-white/10 rounded-lg overflow-hidden cursor-pointer hover:border-[#967E2B] transition-all relative group shadow-lg"
                      >
                        <img 
                          src={id} 
                          alt={`Image ${idx}`} 
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/90 to-transparent">
                          <span className="text-[9px] text-white font-mono truncate block">IMG {idx + 1}</span>
                        </div>
                        <div className="absolute inset-0 bg-[#967E2B]/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>

      <div className="p-3 border-t border-white/10 [.theme-teleradiology_&]:border-slate-200 bg-white/[0.02] [.theme-teleradiology_&]:bg-slate-50">
        <div className="text-[10px] text-white [.theme-teleradiology_&]:text-black font-extrabold text-center bg-white/[0.05] [.theme-teleradiology_&]:bg-white p-2 rounded-lg border border-white/10 [.theme-teleradiology_&]:border-slate-200">
          Select a viewport, then click an image to load it.
        </div>
      </div>
    </div>
  );
}
