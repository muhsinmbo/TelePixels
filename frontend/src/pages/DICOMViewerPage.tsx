import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCornerstone } from '../hooks/useCornerstone';
import { useViewerStore } from '../store/useViewerStore';
import { useAuth } from '../contexts/AuthContext';
import Toolbar from '../components/viewer/Toolbar';
import Sidebar from '../components/viewer/Sidebar';
import Viewport from '../components/viewer/Viewport';
import MetadataPanel from '../components/viewer/MetadataPanel';
import ReportingPanel from '../components/viewer/ReportingPanel';
import HistoryPanel from '../components/viewer/HistoryPanel';
import { cn } from '../lib/utils';
import { AlertTriangle, Info, FileText, History, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function DICOMViewerPage() {
  useCornerstone();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { layout, series, selectedSeriesId, addSeries, setSelectedSeriesId, viewportData, activeViewportIndex } = useViewerStore();
  const [rightPanel, setRightPanel] = React.useState<'metadata' | 'reporting' | 'history'>('metadata');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  
  const patientId = searchParams.get('patientId');
  const requestId = searchParams.get('requestId');

  // Clear everything when we switch patients or requests to ensure no image leakage between patients
  useEffect(() => {
    if (patientId || requestId) {
      useViewerStore.getState().reset();
    }
  }, [patientId, requestId]);

  useEffect(() => {
    if (patientId && requestId && profile) {
      // Check if already loaded
      if (series.some(s => s.id === requestId)) {
        setSelectedSeriesId(requestId);
        // If series already exists but current viewport is empty, populate it
        if (!viewportData[activeViewportIndex] && series.find(s => s.id === requestId)?.imageIds) {
          useViewerStore.getState().setViewportData(activeViewportIndex, series.find(s => s.id === requestId)!.imageIds);
        }
        return;
      }

      const fetchImages = async () => {
        try {
          // Fetch request data for history and reporting requirements
          const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
          const reqSnap = await getDoc(reqRef);
          const reqData = reqSnap.exists() ? reqSnap.data() : { procedures: [] };

          // Fetch patient data for actual name
          const patientRef = doc(db, 'patients', patientId);
          const patientSnap = await getDoc(patientRef);
          const patientData = patientSnap.exists() ? patientSnap.data() : {};

          const imagesRef = collection(db, 'patients', patientId, 'requests', requestId, 'images');
          const q = query(imagesRef, orderBy('uploadedAt', 'asc'));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            console.log('DICOMViewerPage: total images in snapshot', snapshot.docs.length);
            let filteredDocs = snapshot.docs;

            // Apply radiologist filter: only see procedures that need reporting
            if (profile?.role === 'radiologist') {
              // Map procedures and include their original index to match StudyUpload's logic
              const payableProcedures = (reqData.procedures || [])
                .map((p: any, originalIdx: number) => ({
                  ...p,
                  originalIdx: originalIdx.toString(),
                  name: (p.name || '').toLowerCase()
                }))
                .filter((p: any) => p.needsReport);
              
              const payableIds = payableProcedures.map(p => p.id || p.originalIdx);
              const payableNames = payableProcedures.map(p => p.name);

              console.log('DICOMViewerPage: payableProcedures mapped', payableProcedures);

              filteredDocs = snapshot.docs.filter(doc => {
                const imgData = doc.data();
                const procId = imgData.procedureId;
                const procName = (imgData.procedureName || '').toLowerCase();
                const bodyPart = (imgData.dicomHeader?.bodyPart || '').toLowerCase();
                
                // Match based on procedureId OR matching the body part name (for robustness)
                const isIdMatch = procId && payableIds.includes(procId);
                const isNameMatch = procName && payableNames.includes(procName);
                const isBodyPartMatch = bodyPart && payableNames.some((n: string) => bodyPart.includes(n));

                return isIdMatch || isNameMatch || isBodyPartMatch;
              });

              console.log('DICOMViewerPage: filteredDocs count', filteredDocs.length);

              // Fallback: If for some reason we have NO images but the study WAS marked as needing report,
              // or if the request is old/legacy where needsReport was set but procedure-level flags weren't,
              // we fallback to showing everything to ensure the doctor can work.
              if (filteredDocs.length === 0 && reqData.needsReport) {
                console.warn('Metadata filtering returned 0 images, falling back to all images.');
                filteredDocs = snapshot.docs;
              }
            }

            if (filteredDocs.length === 0) {
              console.warn('No relevant images found for this radiologist view');
              return;
            }

            const imageIds = filteredDocs.map(doc => {
              const data = doc.data();
              return data.url || data.data; // Fallback to old base64 field 'data'
            });

            const imageMetadata: { [imageId: string]: any } = {};
            filteredDocs.forEach(doc => {
              const data = doc.data();
              const id = data.url || data.data;
              if (id) {
                imageMetadata[id] = {
                  procedureName: data.procedureName || 'Unknown',
                  bodyPart: data.dicomHeader?.bodyPart || 'Unknown',
                  modality: data.dicomHeader?.modality || 'DX',
                  sopInstanceUid: data.dicomHeader?.sopInstanceUid || 'N/A'
                };
              }
            });

            console.log('DICOMViewerPage: Fetched images', imageIds.length);
            const firstDoc = filteredDocs[0].data();
            
            const newSeries = {
              id: requestId,
              name: `Study: ${requestId.slice(0, 8)}`,
              modality: firstDoc.dicomHeader?.modality || 'DX',
              date: firstDoc.dicomHeader?.studyDate || new Date().toISOString().slice(0, 10),
              patientName: patientData.name || ('Patient ' + patientId.slice(0, 8)),
              imageIds: imageIds,
              imageMetadata: imageMetadata,
              metadata: {
                patientId: patientId,
                patientAge: patientData.age,
                patientSex: patientData.gender,
                studyInstanceUid: requestId,
                rows: firstDoc.dicomHeader?.rows || 512,
                columns: firstDoc.dicomHeader?.columns || 512,
                clinicalHistory: reqData.radiographerHistory || 'No history provided.',
                receptionistInfo: reqData.clinicalInfo || 'No notes.',
                procedures: profile?.role === 'radiologist' 
                  ? (reqData.procedures || []).filter((p: any) => p.needsReport)
                  : (reqData.procedures || [])
              }
            };

            addSeries(newSeries);
            setSelectedSeriesId(newSeries.id);
            // Load the series into the active viewport
            useViewerStore.getState().setViewportData(activeViewportIndex, imageIds);
          } else {
            console.warn('No images found for this request');
          }
        } catch (err) {
          console.error('Error fetching images:', err);
        }
      };
      fetchImages();
    }
  }, [patientId, requestId, series, viewportData, activeViewportIndex, profile]);

  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  const [isHeaderHovered, setIsHeaderHovered] = React.useState(false);
  const [isHeaderPinned, setIsHeaderPinned] = React.useState(false);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHeaderHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHeaderHovered(false);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const isHeaderVisible = isHeaderHovered || isHeaderPinned;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden p-2 md:p-4 gap-2 md:gap-4 relative dicom-viewer-dark-scope">
      {/* Header / Disclaimer - Collapsible on hover */}
      <div className="flex flex-col shrink-0">
        <div 
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative"
        >
          {/* Top Sensor: Invisible hit area at the very top to trigger expansion */}
          {!isHeaderVisible && (
            <div className="absolute top-0 left-0 right-0 h-4 z-[100]" />
          )}
          
          <motion.div
            initial={false}
            animate={{ 
              height: isHeaderVisible ? 'auto' : 0,
              opacity: isHeaderVisible ? 1 : 0,
              marginBottom: isHeaderVisible ? 16 : 0,
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(`/reporting?patientId=${patientId}&requestId=${requestId}`)}
                className="glass-btn px-4 py-2 bg-slate-100 hover:bg-slate-200 text-black border border-slate-200 flex items-center gap-2 text-xs font-black uppercase transition-all shadow-sm"
              >
                <ChevronLeft size={16} className="text-black" />
                Switch to Report Editor
              </button>
              
              <div className="flex flex-col">
                <h1 className="text-sm font-black uppercase text-[#967E2B] tracking-widest">DICOM Viewport</h1>
                <p className="text-[10px] text-black font-black">Request: {requestId?.slice(0,12)}...</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center px-3 md:px-4 py-2 bg-danger/10 border border-danger/20 rounded-xl shrink-0 gap-2 max-w-2xl">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
                <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider">Prototype Only</span>
              </div>
              <p className="text-[9px] md:text-[10px] text-danger/80 leading-tight">
                NOT FOR CLINICAL DIAGNOSIS. The developers assume no liability for medical decisions.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2 w-full min-w-0 overflow-hidden shrink-0">
          <Toolbar />
          <button
            onClick={() => setIsHeaderPinned(!isHeaderPinned)}
            className={cn(
              "p-3 rounded-xl glass-panel transition-all hover:scale-105 active:scale-95",
              isHeaderVisible ? "text-primary bg-primary/10" : "text-muted hover:text-white"
            )}
            title={isHeaderVisible ? "Collapse Header" : "Expand Header"}
          >
            <AnimatePresence mode="wait">
              {isHeaderVisible ? (
                <motion.div
                  key="up"
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 180, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronLeft className="w-5 h-5 rotate-90" />
                </motion.div>
              ) : (
                <motion.div
                  key="down"
                  initial={{ rotate: 180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -180, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronLeft className="w-5 h-5 -rotate-90" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-4 min-h-0 overflow-visible md:overflow-hidden relative">
        <motion.div 
          initial={false}
          animate={{ width: isSidebarCollapsed ? 0 : 320, opacity: isSidebarCollapsed ? 0 : 1 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="hidden lg:block shrink-0 h-full overflow-hidden"
        >
          <Sidebar />
        </motion.div>

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 items-center justify-center rounded-r-lg transition-transform"
          style={{ transform: `translateY(-50%) translateX(${isSidebarCollapsed ? 0 : 320}px)` }}
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", isSidebarCollapsed && "rotate-180")} />
        </button>

        <div className={cn(
          "flex-[2] grid gap-2 md:gap-4 overflow-hidden min-h-[40vh] md:min-h-0",
          layout === '1x1' ? "grid-cols-1 grid-rows-1" : "grid-cols-2 grid-rows-2"
        )}>
          {layout === '1x1' ? (
            <Viewport key={`v${activeViewportIndex}-${selectedSeriesId}`} index={activeViewportIndex} imageIds={viewportData[activeViewportIndex] || []} />
          ) : (
            <>
              <Viewport key={`v0-${selectedSeriesId}`} index={0} imageIds={viewportData[0] || []} />
              <Viewport key={`v1-${selectedSeriesId}`} index={1} imageIds={viewportData[1] || []} />
              <Viewport key={`v2-${selectedSeriesId}`} index={2} imageIds={viewportData[2] || []} />
              <Viewport key={`v3-${selectedSeriesId}`} index={3} imageIds={viewportData[3] || []} />
            </>
          )}
        </div>

        <div className="flex-1 md:w-72 lg:w-80 flex flex-col gap-2 md:gap-4 overflow-hidden">
          <div className="flex bg-slate-900/80 [.theme-teleradiology_&]:bg-slate-200/90 p-0.5 md:p-1 rounded-xl border border-slate-700/80 [.theme-teleradiology_&]:border-slate-300 shrink-0 shadow-inner">
            <button
              onClick={() => setRightPanel('metadata')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all duration-200 cursor-pointer border",
                rightPanel === 'metadata' 
                  ? "bg-[#967E2B]/20 border-2 border-[#967E2B] text-[#d4af37] [.theme-teleradiology_&]:text-black [.theme-teleradiology_&]:bg-[#967E2B]/25 shadow-sm font-black" 
                  : "border-transparent text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:text-white [.theme-teleradiology_&]:hover:text-black hover:bg-slate-800/50 [.theme-teleradiology_&]:hover:bg-slate-300/50"
              )}
            >
              <Info className={cn("w-3.5 h-3.5", rightPanel === 'metadata' ? "text-[#d4af37] [.theme-teleradiology_&]:text-black" : "text-slate-300 [.theme-teleradiology_&]:text-slate-800")} />
              Info
            </button>
            <button
              onClick={() => setRightPanel('reporting')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all duration-200 cursor-pointer border",
                rightPanel === 'reporting' 
                  ? "bg-[#967E2B]/20 border-2 border-[#967E2B] text-[#d4af37] [.theme-teleradiology_&]:text-black [.theme-teleradiology_&]:bg-[#967E2B]/25 shadow-sm font-black" 
                  : "border-transparent text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:text-white [.theme-teleradiology_&]:hover:text-black hover:bg-slate-800/50 [.theme-teleradiology_&]:hover:bg-slate-300/50"
              )}
            >
              <FileText className={cn("w-3.5 h-3.5", rightPanel === 'reporting' ? "text-[#d4af37] [.theme-teleradiology_&]:text-black" : "text-slate-300 [.theme-teleradiology_&]:text-slate-800")} />
              Report
            </button>
            <button
              onClick={() => setRightPanel('history')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all duration-200 cursor-pointer border",
                rightPanel === 'history' 
                  ? "bg-[#967E2B]/20 border-2 border-[#967E2B] text-[#d4af37] [.theme-teleradiology_&]:text-black [.theme-teleradiology_&]:bg-[#967E2B]/25 shadow-sm font-black" 
                  : "border-transparent text-slate-300 [.theme-teleradiology_&]:text-slate-800 hover:text-white [.theme-teleradiology_&]:hover:text-black hover:bg-slate-800/50 [.theme-teleradiology_&]:hover:bg-slate-300/50"
              )}
            >
              <History className={cn("w-3.5 h-3.5", rightPanel === 'history' ? "text-[#d4af37] [.theme-teleradiology_&]:text-black" : "text-slate-300 [.theme-teleradiology_&]:text-slate-800")} />
              History
            </button>
          </div>
          
          <div className="flex-1 min-h-0">
            {rightPanel === 'metadata' ? (
              <MetadataPanel />
            ) : rightPanel === 'reporting' ? (
              <ReportingPanel />
            ) : (
              <HistoryPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
