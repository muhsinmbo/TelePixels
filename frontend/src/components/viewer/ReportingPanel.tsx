import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, addDoc, setDoc, serverTimestamp, query, getDocs, onSnapshot, orderBy, limit, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, Upload, CheckCircle, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['clean']
  ],
};

const QUILL_FORMATS = [
  'bold', 'italic', 'underline', 'strike',
  'list', 'indent',
];

export default function ReportingPanel() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');
  const requestId = searchParams.get('requestId');
  
  const [reportIdx, setReportIdx] = useState<number>(-1);
  const [existingReports, setExistingReports] = useState<Record<number, any>>({});
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const [pdfReports, setPdfReports] = useState<{ name: string; data: string }[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [procedures, setProcedures] = useState<any[]>([]);
  const [requestHistory, setRequestHistory] = useState<{ reception: string; radiographer: string; sonographerWorksheet: any; sonographerWorksheets: any }>({ reception: '', radiographer: '', sonographerWorksheet: null, sonographerWorksheets: null });

  useEffect(() => {
    if (patientId && requestId) {
      const fetchRequestData = async () => {
        try {
          const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
          const snap = await getDoc(reqRef);
          if (snap.exists()) {
            const data = snap.data();
            const procs = data.procedures || [];
            setProcedures(procs);
            setRequestHistory({
              reception: data.clinicalInfo || '',
              radiographer: data.radiographerHistory || '',
              sonographerWorksheet: data.sonographerWorksheet || null,
              sonographerWorksheets: data.sonographerWorksheets || null
            });
            
            if (!['In Progress', 'in progress', 'Partially Reported', 'Completed'].includes(data.status)) {
              await updateDoc(reqRef, { 
                status: 'In Progress',
                updatedAt: serverTimestamp()
              });
            }

            // Auto-select first procedure needing report
            const firstIdx = procs.findIndex((p: any) => typeof p === 'object' && p.needsReport);
            if (firstIdx !== -1) setReportIdx(firstIdx);
          }
        } catch (err) {
          console.error('Error fetching request data:', err);
        }
      };
      fetchRequestData();

      const reportsRef = collection(db, 'patients', patientId, 'requests', requestId, 'reports');
      const unsubscribeReports = onSnapshot(reportsRef, (snapshot) => {
        const reportsMap: Record<number, any> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.procedureIdx !== undefined) {
            if (!reportsMap[data.procedureIdx] || !data.isDraft) {
              reportsMap[data.procedureIdx] = { ...data, id: doc.id };
            }
          }
        });
        setExistingReports(reportsMap);
      }, (err) => {
        console.error('Error listening to reports in panel:', err);
      });

      return () => {
        unsubscribeReports();
      };
    }
  }, [patientId, requestId]);

  // Update form values when selected procedure changes
  useEffect(() => {
    if (reportIdx === -1) return;
    const report = existingReports[reportIdx];
    if (report) {
      setClinicalHistory(report.clinicalHistory || '');
      setFindings(report.findings || '');
      setImpression(report.impression || '');
      setIsCritical(report.isCritical || false);
      setPdfReports(report.pdfReports || []);
    } else {
      setClinicalHistory('');
      setFindings('');
      setImpression('');
      setIsCritical(false);
      setPdfReports([]);
    }
    setPdfFile(null);
  }, [reportIdx, existingReports, requestHistory]);

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setStatus('error');
        setErrorMessage('Only PDF files are allowed');
        return;
      }
      if (file.size > 0.7 * 1024 * 1024) { 
        setStatus('error');
        setErrorMessage('PDF is too large (max 700KB. Large files require external storage.');
        return;
      }
      setPdfFile(file);
      setStatus('idle');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !requestId || (!auth.currentUser && !profile) || reportIdx === -1) return;

    setIsUploading(true);
    setStatus('idle');

    try {
      let currentPdfReports = [...pdfReports];
      if (pdfFile) {
        const pdfData = await fileToBase64(pdfFile);
        currentPdfReports.push({ name: pdfFile.name, data: pdfData });
      }

      const procedure = procedures[reportIdx];
      const procedureName = procedure.name || procedure.partName || procedure.procedureName || 'Unknown';

      const draftId = `draft_${reportIdx}`;
      const draftRef = doc(db, 'patients', patientId, 'requests', requestId, 'reports', draftId);

      const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
      const reqSnap = await getDoc(reqRef);
      const accessCode = reqSnap.exists() ? reqSnap.data().accessCode : '';

      const reportData = {
        clinicalHistory,
        findings,
        impression,
        isCritical,
        pdfReports: currentPdfReports,
        radiologistId: profile?.uid || auth.currentUser?.uid || 'reviewer-superadmin',
        radiologistName: profile?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || 'Radiologist',
        facilityName: profile?.facilityName,
        facilityLetterhead: profile?.facilityLetterhead,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        procedureIdx: reportIdx,
        procedureName,
        isDraft: true,
        accessCode: accessCode || ''
      };

      await setDoc(draftRef, reportData, { merge: true });

      // Signal update to any other listeners (Diagnostic Report page)
      await updateDoc(reqRef, {
        updatedAt: serverTimestamp()
      });

      setStatus('success');
      setPdfFile(null); // Clear pending upload
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Error saving draft:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to save draft');
    } finally {
      setIsUploading(false);
    }
  };

  const removePdf = (idx: number) => {
    setPdfReports(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full h-full bg-transparent p-1 flex flex-col min-h-0 text-white [.theme-teleradiology_&]:text-black">
      <div className="flex items-center gap-2 text-xs font-black text-white [.theme-teleradiology_&]:text-black uppercase tracking-wider mb-4 border-b border-white/10 [.theme-teleradiology_&]:border-slate-300 pb-2">
        <FileText className="w-3.5 h-3.5 text-white [.theme-teleradiology_&]:text-[#967E2B]" />
        <span className="text-white [.theme-teleradiology_&]:text-black font-black">Clinical Drafting</span>
      </div>

      {procedures.filter(p => typeof p === 'object' && p.needsReport).length > 0 && (
        <div className="mb-4 space-y-2">
          <label className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider block">Drafting Procedure</label>
          <div className="flex flex-wrap gap-2">
            {procedures
              .map((proc, idx) => {
                if (typeof proc !== 'object' || !proc.needsReport) return null;
                const isReported = proc.status === 'Reported';
                const hasDraft = existingReports[idx]?.isDraft;
                return (
                  <button 
                    key={idx} 
                    type="button"
                    onClick={() => setReportIdx(idx)}
                    className={cn(
                       "px-2 py-1 rounded-lg border text-[9px] font-black uppercase transition-all flex items-center gap-2 cursor-pointer",
                       reportIdx === idx 
                         ? "bg-[#967E2B] text-white border-[#967E2B]" 
                         : isReported
                           ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                           : hasDraft
                             ? "bg-amber-50 border-amber-200 text-amber-700"
                             : "bg-white/10 border-white/20 text-white hover:text-white hover:bg-white/20 [.theme-teleradiology_&]:bg-slate-50 [.theme-teleradiology_&]:border-slate-200 [.theme-teleradiology_&]:text-slate-700 [.theme-teleradiology_&]:hover:text-black [.theme-teleradiology_&]:hover:bg-slate-100"
                    )}
                  >
                    {isReported && <CheckCircle className="w-2.5 h-2.5" />}
                    {proc.name || proc.partName || proc.procedureName || 'Unknown'}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Clinical Reference Section */}
      {(requestHistory.reception || requestHistory.radiographer || requestHistory.sonographerWorksheet || requestHistory.sonographerWorksheets) && (
        <div className="mb-6 space-y-3 bg-white/[0.03] [.theme-teleradiology_&]:bg-slate-50 rounded-xl p-3 border border-white/10 [.theme-teleradiology_&]:border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-black text-white [.theme-teleradiology_&]:text-[#967E2B] uppercase tracking-[0.2em] mb-1">
            <AlertCircle className="w-3 h-3 text-white [.theme-teleradiology_&]:text-[#967E2B]" />
            Clinical Reference
          </div>
          {requestHistory.reception && (
            <div>
              <p className="text-[9px] text-white [.theme-teleradiology_&]:text-slate-500 uppercase font-bold mb-1">Reception Intake</p>
              <p className="text-[11px] leading-relaxed italic text-white [.theme-teleradiology_&]:text-black font-semibold">"{requestHistory.reception}"</p>
            </div>
          )}
          {requestHistory.radiographer && (
            <div className={requestHistory.reception ? "pt-2 mt-2 border-t border-white/10 [.theme-teleradiology_&]:border-slate-200" : ""}>
              <p className="text-[9px] text-white [.theme-teleradiology_&]:text-slate-500 uppercase font-bold mb-1">Radiographer Obs</p>
              <p className="text-[11px] leading-relaxed italic text-white [.theme-teleradiology_&]:text-black font-semibold">"{requestHistory.radiographer}"</p>
            </div>
          )}
          {(() => {
            const activeWS = (requestHistory.sonographerWorksheets && requestHistory.sonographerWorksheets[reportIdx]) || (reportIdx === 0 ? requestHistory.sonographerWorksheet : null);
            if (!activeWS) return null;

            const getOnlyImpressions = (commentsText: string): string => {
              if (!commentsText) return '';
              
              const sections = commentsText.split(/(?=---\s+.*?\s+---)/g);
              
              const processedSections = sections.map(sec => {
                const headerMatch = sec.match(/^(---\s+.*?\s+---)/);
                const header = headerMatch ? headerMatch[1] : '';
                
                const impIndex = sec.search(/IMPRESSION:/i);
                if (impIndex !== -1) {
                  let impText = sec.substring(impIndex);
                  impText = impText.replace(/^IMPRESSION:\s*/i, '').trim();
                  return header ? `${header}\n${impText}` : impText;
                } else {
                  if (sec.toLowerCase().includes('clinical history') || sec.toLowerCase().includes('findings')) {
                    const lines = sec.split('\n');
                    const filtered = lines.filter(l => !l.toUpperCase().includes('CLINICAL HISTORY') && !l.toUpperCase().includes('FINDINGS'));
                    return filtered.join('\n').trim();
                  }
                  return sec.trim();
                }
              }).filter(Boolean);
              
              return processedSections.join('\n\n').trim();
            };

            const cleanedComments = getOnlyImpressions(activeWS.comments || '');

            return (
              <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-[#967E2B] uppercase font-black">Sonographer Worksheet</p>
                  <span className="text-[8px] bg-[#967E2B]/10 text-[#967E2B] px-1.5 py-0.2 rounded font-bold uppercase">
                    {activeWS.type?.replace('_', ' ')}
                  </span>
                </div>
                
                {activeWS.measurements && Object.keys(activeWS.measurements).length > 0 && (
                  <div className="grid grid-cols-1 gap-1 font-mono text-[10px] bg-white p-2 rounded border border-slate-200 max-h-[140px] overflow-y-auto no-scrollbar">
                    {Object.entries(activeWS.measurements).map(([key, val]) => {
                      if (!val) return null;
                      const beautifiedKeys: Record<string, string> = {
                        fhr: 'FHR',
                        bpd: 'BPD',
                        fl: 'Femur Len (FL)',
                        ac: 'AC',
                        hc: 'HC',
                        afi: 'AFI',
                        placenta: 'Placenta',
                        gestAge: 'Gestational Age',
                        edd: 'EDD',
                        liverSize: 'Liver Size',
                        liverEchogenicity: 'Liver Echo',
                        gallbladder: 'Gallbladder',
                        cbd: 'CBD',
                        rKidney: 'R Kidney',
                        lKidney: 'L Kidney',
                        spleenSize: 'Spleen',
                        pancreas: 'Pancreas',
                        uterusL: 'Uterus L',
                        uterusW: 'Uterus W',
                        uterusH: 'Uterus H',
                        endoThickness: 'Endometrium',
                        rOvary: 'R Ovary',
                        lOvary: 'L Ovary',
                        freeFluid: 'Free Fluid'
                      };
                      const label = beautifiedKeys[key] || key;
                      let suffix = '';
                      if (['bpd', 'fl', 'ac', 'hc', 'cbd', 'endoThickness'].includes(key)) suffix = ' mm';
                      if (['afi', 'liverSize', 'rKidney', 'lKidney', 'spleenSize', 'uterusL', 'uterusW', 'uterusH'].includes(key)) suffix = ' cm';
                      if (key === 'fhr') suffix = ' bpm';
                      return (
                        <div key={key} className="flex justify-between border-b border-slate-200/50 py-0.5">
                          <span className="text-slate-500 text-[9px]">{label}:</span>
                          <span className="text-black font-bold">{String(val)}{suffix}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {cleanedComments && (
                  <div>
                    <p className="text-[8px] text-slate-500 uppercase font-bold mb-0.5">Worksheet Findings</p>
                    <p className="text-[10px] leading-relaxed italic text-black p-2 bg-white border border-slate-200 rounded whitespace-pre-wrap font-medium">
                      "{cleanedComments}"
                    </p>
                  </div>
                )}
                
                <p className="text-[7px] text-right text-slate-500">
                  - {activeWS.sonographerName || 'Sonographer'}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 no-scrollbar text-white [.theme-teleradiology_&]:text-black">
        <div className="space-y-1">
          <label className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider block">
            Clinical History
          </label>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <ReactQuill
              theme="snow"
              value={clinicalHistory}
              onChange={setClinicalHistory}
              readOnly={reportIdx === -1}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Clinical background..."
              className="quill-light"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider block">
            Draft Findings {reportIdx !== -1 && <span className="text-[#967E2B] italic">— {procedures[reportIdx].name || procedures[reportIdx].partName}</span>}
          </label>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <ReactQuill
              theme="snow"
              value={findings}
              onChange={setFindings}
              readOnly={reportIdx === -1}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Type findings draft here..."
              className="quill-light"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider block">Draft Impression</label>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <ReactQuill
              theme="snow"
              value={impression}
              onChange={setImpression}
              readOnly={reportIdx === -1}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Draft final impression..."
              className="quill-light"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-white [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider block">Draft PDF Attachment</label>
          
          {/* List of already attached PDFs in the draft */}
          {pdfReports.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {pdfReports.map((pdf, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 bg-emerald-50 rounded border border-emerald-200">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-3 h-3 text-emerald-700 shrink-0" />
                    <span className="text-[9px] font-medium truncate text-emerald-800">{pdf.name}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => removePdf(idx)}
                    className="p-1 text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfChange}
              className="hidden"
              id="pdf-upload"
              disabled={reportIdx === -1}
            />
            <label
              htmlFor="pdf-upload"
              className={cn(
                "w-full glass-btn py-3 text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-2 cursor-pointer transition-all border",
                pdfFile ? "bg-[#967E2B]/10 border-[#967E2B] text-black" : "bg-slate-50 border-slate-200 text-slate-600 hover:text-black hover:bg-slate-100",
                reportIdx === -1 && "opacity-50 cursor-not-allowed"
              )}
            >
              <Upload className="w-3 h-3" />
              {pdfFile ? pdfFile.name : 'Attach New PDF'}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="checkbox"
            id="isCritical"
            checked={isCritical}
            onChange={e => setIsCritical(e.target.checked)}
            disabled={reportIdx === -1}
            className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-red-600 focus:ring-red-500"
          />
          <label htmlFor="isCritical" className="text-[10px] font-bold text-red-600 uppercase tracking-wider cursor-pointer">Critical Finding Flag</label>
        </div>

        {status === 'error' && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">{errorMessage}</span>
          </div>
        )}

        {status === 'success' && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">Draft saved to diagnostic page!</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isUploading || reportIdx === -1 || (!findings && !impression && !pdfFile)}
          className="w-full py-2.5 rounded-xl bg-[#967E2B] hover:bg-[#967E2B]/90 text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving Draft...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Save Draft
            </>
          )}
        </button>
      </form>
    </div>
  );
}
