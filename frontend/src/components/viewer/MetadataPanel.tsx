import React from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import { Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MetadataPanel() {
  const { series, selectedSeriesId, activeViewportIndex, viewportImageIndices, viewportData } = useViewerStore();
  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  if (!selectedSeries) return null;

  // Active image metadata
  const activeImageIds = viewportData[activeViewportIndex] || [];
  const activeImageIndex = viewportImageIndices[activeViewportIndex] || 0;
  const activeImageId = activeImageIds[activeImageIndex];
  const activeMetadata = selectedSeries.imageMetadata?.[activeImageId] || {};

  const metadata = [
    { label: 'Patient Name', value: selectedSeries.patientName },
    { label: 'Patient ID', value: selectedSeries.metadata.patientId },
    { label: 'Patient Age', value: selectedSeries.metadata.patientAge ? `${selectedSeries.metadata.patientAge} Y` : 'N/A' },
    { label: 'Patient Sex', value: selectedSeries.metadata.patientSex },
    { label: 'Modality', value: activeMetadata.modality || selectedSeries.modality },
    { label: 'Study Date', value: selectedSeries.date },
    { label: 'Procedure (Active)', value: activeMetadata.procedureName || 'N/A', primary: true },
    { label: 'Body Part (DICOM)', value: activeMetadata.bodyPart || 'N/A' },
    { label: 'Procedures (Study)', value: selectedSeries.metadata.procedures && selectedSeries.metadata.procedures.length > 0
      ? selectedSeries.metadata.procedures.map((p: any) => {
          const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Unknown');
          const lat = p.laterality && p.laterality !== 'None' ? ` (${p.laterality})` : '';
          return `${name}${lat}`;
        }).join(', ')
      : 'N/A'
    },
    { label: 'Series Desc', value: selectedSeries.name },
    { label: 'SOP Instance UID', value: activeMetadata.sopInstanceUid || 'N/A', mono: true },
    { label: 'Dimensions', value: `${selectedSeries.metadata.rows} x ${selectedSeries.metadata.columns}` },
    { label: 'Slices', value: selectedSeries.imageIds.length },
    { label: 'Series UID', value: selectedSeries.id, mono: true },
  ];

  return (
    <div className="w-full h-full bg-transparent p-1 flex flex-col min-h-0 text-slate-100">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
        <Info className="w-3.5 h-3.5 text-[#d4af37]" />
        <span className="metadata-header text-slate-100 font-black">DICOM Metadata</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/20">
        {/* Priority Highlight: Clinical History */}
        <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-1 mb-4 shadow-sm">
          <p className="metadata-label primary-label text-[10px] text-[#d4af37] uppercase font-black tracking-widest">Clinical History</p>
          <p className="clinical-history-text text-xs text-white leading-relaxed italic font-semibold">
            "{selectedSeries.metadata.clinicalHistory || 'No history provided.'}"
          </p>
        </div>

        {metadata.map((item) => (
          <div 
            key={item.label} 
            className={cn(
              "space-y-1 pb-2 border-b border-white/[0.06] last:border-b-0", 
              (item as any).primary && "p-2.5 bg-white/[0.05] rounded-lg border border-white/10 shadow-sm"
            )}
          >
            <p className={cn(
              "metadata-label text-[10px] uppercase font-black tracking-wider", 
              (item as any).primary 
                ? "primary-label text-[#d4af37]" 
                : "text-slate-400"
            )}>
              {item.label}
            </p>
            <p className={cn(
              "metadata-value text-xs font-bold break-all", 
              (item as any).primary 
                ? "primary-label text-[#d4af37] text-sm font-black" 
                : (item.mono 
                    ? 'metadata-value-mono font-mono text-emerald-400 font-extrabold' 
                    : 'text-slate-100 font-extrabold')
            )}>
              {item.value || 'N/A'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
