import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../services/loggerService';
import { toast } from 'react-hot-toast';
import { motion } from 'motion/react';
import { ChevronLeft, Save, FileText, Baby, Activity, Columns, User, Clock, AlertCircle, Sparkles, Eye, CheckCircle2, Circle, Download, Paperclip, FileCheck, Loader2, Upload, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { generateProfessionalPDF } from '../services/reportPdfService';
import { ULTRASOUND_PROCEDURES } from '../constants';
import { StudyTakeoverModal } from '../components/StudyTakeoverModal';

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['clean']
  ],
};

const QUILL_FORMATS = [
  'header',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'indent',
  'link', 'image'
];

// Prefilled templates have been removed.

export default function UltrasoundReportPage() {
  const { patientId, requestId } = useParams<{ patientId: string; requestId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [patient, setPatient] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);

  // Core Active Structured Report States (tied to specified selectedIdx)
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [activeType, setActiveType] = useState<'ob_gyn' | 'abdominal' | 'pelvic_gyn'>('ob_gyn');
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfReports, setPdfReports] = useState<{ name: string; data: string; url?: string }[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Concurrent reporting lock modal state
  const [takeoverModalOpen, setTakeoverModalOpen] = useState(false);
  const [activeReporterInfo, setActiveReporterInfo] = useState<{ name: string; role: string } | null>(null);
  const [hasAcceptedTakeover, setHasAcceptedTakeover] = useState(false);

  const claimStudyLock = async () => {
    if (!patientId || !requestId) return;
    try {
      const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
      await updateDoc(reqRef, {
        activeReporter: {
          uid: profile?.uid || 'sonographer',
          name: profile?.displayName || profile?.email || 'Sonographer',
          role: profile?.role || 'sonographer',
          updatedAt: new Date().toISOString()
        },
        sonographerId: profile?.uid || 'sonographer',
        sonographerName: profile?.displayName || profile?.email || 'Sonographer',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error claiming study lock:', err);
    }
  };

  const handleConfirmTakeover = async () => {
    setTakeoverModalOpen(false);
    setHasAcceptedTakeover(true);
    await claimStudyLock();
    toast.success('Taken over study reporting successfully');
  };

  const handleCancelTakeover = () => {
    setTakeoverModalOpen(false);
    navigate('/pending');
  };

  // Structured record of worksheets for each procedure index
  const [worksheets, setWorksheets] = useState<Record<number, {
    type: 'ob_gyn' | 'abdominal' | 'pelvic_gyn';
    clinicalHistory: string;
    findings: string;
    impression: string;
    pdfUrl?: string | null;
    pdfFileName?: string | null;
    pdfReports?: { name: string; data: string; url?: string }[];
    status?: string;
    isFinalized?: boolean;
    isDraft?: boolean;
  }>>({});

  const rawProcedures = (() => {
    if (!request?.procedures || request.procedures.length === 0) {
      return [{ name: 'Ultrasound', raw: null, originalIndex: 0 }];
    }
    const filtered = request.procedures
      .map((p: any, idx: number) => {
        const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound');
        return { name, raw: p, originalIndex: idx };
      })
      .filter((proc: any) => {
        const lower = proc.name.toLowerCase();
        return ULTRASOUND_PROCEDURES.some(up => up.toLowerCase() === lower) || 
               lower.includes('ultrasound') || 
               lower.includes('sonography') || 
               lower.includes('doppler') || 
               lower.includes('follicular');
      });
    return filtered.length > 0 ? filtered : [{ name: 'Ultrasound', raw: null, originalIndex: 0 }];
  })();

  useEffect(() => {
    if (!patientId || !requestId) {
      toast.error('Invalid patient or request references');
      setLoading(false);
      return;
    }

    const fetchReportData = async () => {
      setLoading(true);
      try {
        const uRequestRef = doc(db, 'patients', patientId, 'requests', requestId);
        const uPatientRef = doc(db, 'patients', patientId);
        
        const [reqSnap, patientSnap] = await Promise.all([
          getDoc(uRequestRef),
          getDoc(uPatientRef)
        ]);

        if (patientSnap.exists()) {
          setPatient({ id: patientSnap.id, ...patientSnap.data() });
        }

        if (reqSnap.exists()) {
          const reqData = reqSnap.data();
          setRequest({ id: reqSnap.id, ...reqData });
          
          const rawWorksheets = reqData.sonographerWorksheets || {};
          
          // Back-compatibility for single existing worksheet
          if (!rawWorksheets[0] && reqData.sonographerWorksheet) {
            rawWorksheets[0] = reqData.sonographerWorksheet;
          }

          const activeProcedures = reqData.procedures && reqData.procedures.length > 0
            ? reqData.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound'))
            : ['Ultrasound'];

          const initialWorksheets: Record<number, any> = {};
          activeProcedures.forEach((proc: string, idx: number) => {
            if (rawWorksheets[idx]) {
              const existingPdfUrl = rawWorksheets[idx].pdfUrl || rawWorksheets[idx].uploadedPdfUrl || null;
              const existingPdfFileName = rawWorksheets[idx].pdfFileName || null;
              let existingPdfReports = rawWorksheets[idx].pdfReports || [];
              if (existingPdfReports.length === 0 && existingPdfUrl) {
                existingPdfReports = [{
                  name: existingPdfFileName || 'Uploaded_Sonographer_Report.pdf',
                  data: existingPdfUrl,
                  url: existingPdfUrl
                }];
              }

              initialWorksheets[idx] = {
                type: rawWorksheets[idx].type || 'ob_gyn',
                clinicalHistory: rawWorksheets[idx].clinicalHistory || '',
                findings: rawWorksheets[idx].findings || rawWorksheets[idx].comments || '',
                impression: rawWorksheets[idx].impression || '',
                pdfUrl: existingPdfUrl,
                pdfFileName: existingPdfFileName,
                pdfReports: existingPdfReports
              };
            } else {
              initialWorksheets[idx] = {
                type: 'ob_gyn',
                clinicalHistory: '',
                findings: '',
                impression: '',
                pdfUrl: null,
                pdfFileName: null,
                pdfReports: []
              };
            }
          });

          setWorksheets(initialWorksheets);

          // Find first ultrasound procedure's original index
          const localFilteredProcedures = reqData.procedures && reqData.procedures.length > 0
            ? reqData.procedures
                .map((p: any, idx: number) => {
                  const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound');
                  return { name, raw: p, originalIndex: idx };
                })
                .filter((proc: any) => {
                  const lower = proc.name.toLowerCase();
                  return ULTRASOUND_PROCEDURES.some(up => up.toLowerCase() === lower) || 
                         lower.includes('ultrasound') || 
                         lower.includes('sonography') || 
                         lower.includes('doppler') || 
                         lower.includes('follicular');
                })
            : [];

          const firstOriginalIdx = localFilteredProcedures[0]?.originalIndex ?? 0;

          // Check active reporter lock
          const activeReporter = reqData.activeReporter;
          const legacySonographerId = reqData.sonographerId;
          const legacySonographerName = reqData.sonographerName;
          const currentUserId = profile?.uid;

          const isOccupiedByAnother = activeReporter
            ? (activeReporter.uid && activeReporter.uid !== currentUserId)
            : (legacySonographerId && legacySonographerId !== currentUserId && (reqData.status === 'In Progress' || reqData.sonographerStatus === 'In Progress'));

          if (isOccupiedByAnother && !hasAcceptedTakeover) {
            const reporterName = activeReporter?.name || legacySonographerName || 'Another clinician';
            const reporterRole = activeReporter?.role || 'sonographer';
            setActiveReporterInfo({ name: reporterName, role: reporterRole });
            setTakeoverModalOpen(true);
          } else {
            claimStudyLock();
          }

          // Populate first view
          setSelectedIdx(firstOriginalIdx);
          const firstWS = initialWorksheets[firstOriginalIdx];
          if (firstWS) {
            setActiveType(firstWS.type);
            setClinicalHistory(firstWS.clinicalHistory);
            setFindings(firstWS.findings);
            setImpression(firstWS.impression);
            setPdfUrl(firstWS.pdfUrl || null);
            setPdfFileName(firstWS.pdfFileName || null);
            setPdfReports(firstWS.pdfReports || []);
          }
        } else {
          toast.error('Requested study cannot be found');
        }
      } catch (err) {
        console.error('Failed to load ultrasound reporting data:', err);
        toast.error('Failed to load existing diagnostic report details');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [patientId, requestId]);

  // Handle Switching Procedure Index cleanly
  const switchProcedure = (newOriginalIdx: number) => {
    // 1. Save current active values to the worksheets map state
    const updated = {
      ...worksheets,
      [selectedIdx]: {
        type: activeType,
        clinicalHistory,
        findings,
        impression,
        pdfUrl,
        pdfFileName,
        pdfReports
      }
    };
    setWorksheets(updated);

    // 2. Load the states for the newly selected index
    const nextWS = updated[newOriginalIdx];
    if (nextWS) {
      setActiveType(nextWS.type);
      setClinicalHistory(nextWS.clinicalHistory || '');
      setFindings(nextWS.findings || '');
      setImpression(nextWS.impression || '');
      setPdfUrl(nextWS.pdfUrl || null);
      setPdfFileName(nextWS.pdfFileName || null);
      setPdfReports(nextWS.pdfReports || []);
    } else {
      setActiveType('ob_gyn');
      setClinicalHistory('');
      setFindings('');
      setImpression('');
      setPdfUrl(null);
      setPdfFileName(null);
      setPdfReports([]);
    }

    setSelectedIdx(newOriginalIdx);
    const targetProc = rawProcedures.find(p => p.originalIndex === newOriginalIdx);
    toast.success(`Switched to drafting: ${targetProc?.name || 'Ultrasound'}`);
  };

  // PDF File Upload Handler for Sonographers (identical behavior to Radiologist interface)
  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    if (file.size > 0.7 * 1024 * 1024) { 
      toast.error('File too large for database (Max 700KB). Large files require external storage.');
      return;
    }

    setUploadingPdf(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const finalUrl = evt.target?.result as string;
      if (!finalUrl) {
        setUploadingPdf(false);
        toast.error('Failed to read PDF file');
        return;
      }
      const newReportItem = { name: file.name, data: finalUrl, url: finalUrl };
      setPdfReports(prev => {
        const updated = [...prev, newReportItem];
        setWorksheets(wPrev => ({
          ...wPrev,
          [selectedIdx]: {
            ...(wPrev[selectedIdx] || {}),
            type: activeType,
            clinicalHistory,
            findings,
            impression,
            pdfUrl: finalUrl,
            pdfFileName: file.name,
            pdfReports: updated
          }
        }));
        return updated;
      });
      setPdfUrl(finalUrl);
      setPdfFileName(file.name);
      setUploadingPdf(false);
      toast.success('PDF report attached');
      if (e.target) e.target.value = '';
    };

    reader.onerror = () => {
      setUploadingPdf(false);
      toast.error('Failed to read PDF file');
    };

    reader.readAsDataURL(file);
  };

  const handleRemovePdf = (indexToRemove?: number) => {
    setPdfReports(prev => {
      const updated = indexToRemove !== undefined ? prev.filter((_, i) => i !== indexToRemove) : [];
      const newPdfUrl = updated.length > 0 ? (updated[updated.length - 1].url || updated[updated.length - 1].data) : null;
      const newPdfName = updated.length > 0 ? updated[updated.length - 1].name : null;
      
      setPdfUrl(newPdfUrl);
      setPdfFileName(newPdfName);

      setWorksheets(wPrev => ({
        ...wPrev,
        [selectedIdx]: {
          ...(wPrev[selectedIdx] || {}),
          type: activeType,
          clinicalHistory,
          findings,
          impression,
          pdfUrl: newPdfUrl,
          pdfFileName: newPdfName,
          pdfReports: updated
        }
      }));

      return updated;
    });
  };

  // Helper to persist current worksheets state directly to Firestore
  const persistWorksheetsToFirebase = async (currentWorksheetsMap: Record<number, any>, markStudyComplete: boolean = false) => {
    if (!patientId || !requestId) return;
    const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
    const reqSnap = await getDoc(reqRef);
    const existingData = reqSnap.exists() ? reqSnap.data() : {};
    const baseWorksheets = existingData?.sonographerWorksheets || {};

    const formattedWorksheets: Record<number, any> = { ...baseWorksheets };
    let consolidatedHistoryText = '';
    let consolidatedCommentsText = '';

    rawProcedures.forEach((proc: any) => {
      const origIdx = proc.originalIndex;
      const ws = currentWorksheetsMap[origIdx] || {
        type: 'ob_gyn',
        clinicalHistory: '',
        findings: '',
        impression: '',
        pdfUrl: null,
        pdfFileName: null,
        pdfReports: []
      };

      const cleanCH = (ws.clinicalHistory || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanFD = (ws.findings || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanIM = (ws.impression || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      const compiledComments = `IMPRESSION:\n${cleanIM}`;

      const effectivePdfReports = ws.pdfReports || [];
      const effectivePdfUrl = ws.pdfUrl || (effectivePdfReports.length > 0 ? (effectivePdfReports[0].url || effectivePdfReports[0].data) : null);
      const effectivePdfFileName = ws.pdfFileName || (effectivePdfReports.length > 0 ? effectivePdfReports[0].name : null);

      formattedWorksheets[origIdx] = {
        type: ws.type || 'ob_gyn',
        clinicalHistory: ws.clinicalHistory || '',
        findings: ws.findings || '',
        impression: ws.impression || '',
        pdfUrl: effectivePdfUrl,
        uploadedPdfUrl: effectivePdfUrl,
        pdfFileName: effectivePdfFileName,
        pdfReports: effectivePdfReports,
        comments: compiledComments,
        measurements: ws.measurements || {},
        status: markStudyComplete ? 'Completed' : (ws.status || (ws.isFinalized ? 'Completed' : 'Draft')),
        isFinalized: markStudyComplete ? true : !!ws.isFinalized,
        isDraft: markStudyComplete ? false : !!ws.isDraft,
        completedAt: ws.completedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sonographerName: profile?.displayName || 'Unknown Sonographer',
        sonographerId: profile?.uid || 'Unknown'
      };

      const pNameUpper = proc.name.toUpperCase();
      if (cleanCH) {
        consolidatedHistoryText += `[${pNameUpper}]: ${cleanCH}\n`;
      }
      consolidatedCommentsText += `--- ${pNameUpper} ---\nIMPRESSION:\n${cleanIM}\n\n`;
    });

    const firstUltrasoundProc = rawProcedures[0];
    const legacyWorksheet = { ...(formattedWorksheets[firstUltrasoundProc?.originalIndex ?? 0] || {}) };
    if (rawProcedures.length > 1) {
      legacyWorksheet.comments = consolidatedCommentsText.trim();
      legacyWorksheet.clinicalHistory = consolidatedHistoryText.trim();
    }

    const updatePayload: any = {
      sonographerWorksheets: formattedWorksheets,
      sonographerWorksheet: legacyWorksheet,
      updatedAt: serverTimestamp()
    };

    if (markStudyComplete) {
      updatePayload.sonographerCompleted = true;
      updatePayload.sonographerStatus = 'Completed';
      updatePayload.sonographerWorksheetStatus = 'Completed';
      updatePayload.sonographerCompletedAt = serverTimestamp();
    } else {
      updatePayload.sonographerStatus = 'In-Progress';
      updatePayload.sonographerWorksheetStatus = 'In-Progress';
    }

    await updateDoc(reqRef, updatePayload);
  };

  // Handle saving active draft / finalizing single procedure worksheet / finalizing study
  const handleSaveDraft = async () => {
    if (!patientId || !requestId) return;
    const currentProc = rawProcedures.find(p => p.originalIndex === selectedIdx) || rawProcedures[0];
    setSaving(true);
    try {
      const updatedMap = {
        ...worksheets,
        [selectedIdx]: {
          type: activeType,
          clinicalHistory,
          findings,
          impression,
          pdfUrl,
          pdfFileName,
          pdfReports,
          isDraft: true,
          status: 'Draft'
        }
      };
      setWorksheets(updatedMap);
      await persistWorksheetsToFirebase(updatedMap, false);
      toast.success(`Draft saved for ${currentProc.name}`);
    } catch (err: any) {
      console.error('Error saving draft:', err);
      toast.error('Failed to save draft: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeProcedure = async () => {
    if (!patientId || !requestId) return;
    const currentProc = rawProcedures.find(p => p.originalIndex === selectedIdx) || rawProcedures[0];
    setSaving(true);
    try {
      const updatedWs = {
        ...worksheets,
        [selectedIdx]: {
          type: activeType,
          clinicalHistory,
          findings,
          impression,
          pdfUrl,
          pdfFileName,
          pdfReports,
          isFinalized: true,
          status: 'Completed'
        }
      };
      setWorksheets(updatedWs);
      await persistWorksheetsToFirebase(updatedWs, false);
      toast.success(`Worksheet finalized for ${currentProc.name}!`);

      // Auto-select next procedure if available and not completed
      const nextProc = rawProcedures.find(p => {
        const ws = updatedWs[p.originalIndex];
        return !(ws?.isFinalized || ws?.status === 'Completed');
      });
      if (nextProc) {
        switchProcedure(nextProc.originalIndex);
      }
    } catch (err: any) {
      console.error('Error finalizing procedure:', err);
      toast.error('Failed to finalize procedure: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const reportedProcsCount = rawProcedures.filter(proc => {
    const origIdx = proc.originalIndex;
    const ws = origIdx === selectedIdx 
      ? { ...worksheets[origIdx], clinicalHistory, findings, impression, pdfReports } 
      : worksheets[origIdx];
    const hasContent = ws && (
      (ws.findings && ws.findings.replace(/<[^>]*>/g, '').trim().length > 0) ||
      (ws.impression && ws.impression.replace(/<[^>]*>/g, '').trim().length > 0) ||
      (ws.clinicalHistory && ws.clinicalHistory.replace(/<[^>]*>/g, '').trim().length > 0) ||
      (ws.pdfReports && ws.pdfReports.length > 0)
    );
    return hasContent || ws?.isFinalized || ws?.status === 'Completed';
  }).length;

  const isAnyProcedureReported = reportedProcsCount > 0;
  const isAllProceduresReported = reportedProcsCount >= rawProcedures.length;

  // Handle saving all reports drafts / finalizing study
  const handleSave = async () => {
    if (!patientId || !requestId) return;
    setSaving(true);
    try {
      const finalWorksheets = {
        ...worksheets,
        [selectedIdx]: {
          type: activeType,
          clinicalHistory,
          findings,
          impression,
          pdfUrl,
          pdfFileName,
          pdfReports,
          isFinalized: true,
          status: 'Completed'
        }
      };
      setWorksheets(finalWorksheets);
      await persistWorksheetsToFirebase(finalWorksheets, true);

      logAction({
        action: 'SONOGRAPHER_WORKSHEET_SAVE',
        details: `Sonographer ${profile?.displayName} finalized ultrasound study for ${rawProcedures.length} requested procedures for patient ${patient?.name || 'Unknown'}.`,
        targetId: requestId
      });

      toast.success('Sonography study finalized and completed successfully');
      navigate('/pending');
    } catch (err: any) {
      console.error('Error saving ultrasound reports:', err);
      toast.error('Failed to save diagnostic reports: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });

  useEffect(() => {
    const unsubscribeGlobal = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setFacilityInfo({
          name: data.facilityName || '',
          logo: data.facilityLogo || '',
          letterhead: data.facilityLetterhead || ''
        });
      }
    });
    return () => unsubscribeGlobal();
  }, []);

  const procedureName = request?.procedures && request.procedures.length > 0
    ? request.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound')).join(', ')
    : 'Ultrasound';

  const previewProfessionalReport = (targetOriginalIdx: number) => {
    try {
      const currentWorksheets = {
        ...worksheets,
        [selectedIdx]: {
          type: activeType,
          clinicalHistory,
          findings,
          impression
        }
      };

      const ws = currentWorksheets[targetOriginalIdx] || {
        type: 'ob_gyn',
        clinicalHistory: '',
        findings: '',
        impression: ''
      };

      const targetProc = rawProcedures.find(p => p.originalIndex === targetOriginalIdx);
      const pdfProcedureName = targetProc?.name || 'Ultrasound';
      const pdfClinicalHistory = ws.clinicalHistory;
      const pdfFindings = ws.findings;
      const pdfImpression = ws.impression;

      const docInstance = generateProfessionalPDF({
        patient: {
          name: patient?.name || 'Unknown',
          id: patient?.id || 'N/A',
          age: patient?.age,
          gender: patient?.gender
        },
        request: {
          createdAt: (request?.createdAt as any),
          id: request?.id || 'N/A'
        },
        report: {
          procedureName: pdfProcedureName,
          clinicalHistory: pdfClinicalHistory || 'No history provided',
          findings: pdfFindings || 'No findings recorded',
          impression: pdfImpression || 'No impressions summary provided',
          radiologistName: profile?.displayName || 'Sonographer'
        },
        facility: {
          name: facilityInfo.name || profile?.facilityName,
          letterhead: facilityInfo.letterhead || profile?.facilityLetterhead
        }
      });

      const pdfDataUrl = docInstance.output('datauristring');
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${pdfDataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        win.document.title = `Preview - ${pdfProcedureName}`;
      } else {
        toast.error('Could not open preview. Please allow popups for this site.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate preview');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">Retrieving diagnostic environment configuration...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Title Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/pending')}
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-muted hover:text-main transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold tracking-tight text-main">Ultrasound Diagnostic Reporting Interface</h1>
            </div>
            <p className="text-xs text-muted mt-1">
              Active diagnostic drafting session • Sonographer: <span className="text-main font-semibold">{profile?.displayName || 'Unknown'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/pending')}
            disabled={saving}
            className="glass-btn bg-white/5 text-muted hover:text-main px-4 py-2 text-xs font-bold"
          >
            Back to List
          </button>
          <button
            onClick={() => previewProfessionalReport(selectedIdx)}
            title="Preview Professional PDF"
            aria-label="Preview Professional PDF"
            className="p-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all flex items-center justify-center shrink-0"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            title={saving ? "Finalizing Study..." : isAllProceduresReported ? "Complete Study & Sign Off" : "Complete Study (Partial)"}
            aria-label="Complete Study & Sign Off"
            className={cn(
              "p-2.5 rounded-xl font-bold flex items-center justify-center shadow-lg transition-colors duration-200 border shrink-0",
              isAllProceduresReported 
                ? "bg-success text-black border-success hover:bg-success/90" 
                : "bg-warning text-black border-warning hover:bg-warning/90"
            )}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Patient Profile & Study Details Banner - Placed AT THE VERY TOP */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-5 rounded-2xl border border-white/10 bg-white/5 shadow-inner">
        {/* Patient Profile Panel */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-2 pb-1.5 border-b border-white/5">
            <User className="w-3.5 h-3.5 text-primary" />
            Patient Profile
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Name</span>
              <span className="text-main font-semibold truncate text-sm">{patient?.name || 'Unknown'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">MRN / ID</span>
              <span className="text-primary font-bold">{patient?.id || 'N/A'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Age / Gender</span>
              <span className="text-main font-semibold">
                {patient?.age ? `${patient.age} years` : 'N/A'} • {patient?.gender || 'N/A'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Contact</span>
              <span className="text-main font-semibold">{patient?.phone || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Study Details Panel */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-accent flex items-center gap-2 pb-1.5 border-b border-white/5">
            <Clock className="w-3.5 h-3.5 text-accent" />
            Study details
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Modality</span>
              <span className="text-emerald-400 font-bold uppercase text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded w-max mt-0.5">
                US (Ultrasound)
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Priority</span>
              <div>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mt-0.5 inline-block",
                  request?.priority === 'STAT' ? "bg-danger/20 text-danger border border-danger/30" : "bg-primary/20 text-primary border border-primary/30"
                )}>
                  {request?.priority || 'Routine'}
                </span>
              </div>
            </div>
            <div className="flex flex-col col-span-2">
              <span className="text-muted text-[10px] uppercase font-sans font-bold tracking-tight">Procedure(s)</span>
              <span className="text-main font-bold truncate text-sm" title={procedureName}>{procedureName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Finalization Status Banner Card - Identical to Radiologist interface */}
      {isAnyProcedureReported && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className={cn(
            "p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl",
            isAllProceduresReported 
              ? "bg-success/15 border-success/20 text-success" 
              : "bg-warning/10 border-warning/25 text-warning"
          )}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className={cn("w-6 h-6 mt-0.5 shrink-0", isAllProceduresReported ? "text-success" : "text-warning")} />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-1">
                {isAllProceduresReported ? "All Worksheets Finalized" : "Worksheets In Progress"}
              </h3>
              <p className="text-xs opacity-90 leading-relaxed max-w-xl">
                {isAllProceduresReported 
                  ? "Every required ultrasound procedure in this study has been finalized. Click the button to formally complete and sign off the case, which will archive it from your active worklist."
                  : `You have completed ${reportedProcsCount} of ${rawProcedures.length} ultrasound worksheets. While you can finalize the study at any time, we recommend finishing all first, but you can sign off at any stage.`
                }
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            title={saving ? "Finalizing Study..." : isAllProceduresReported ? "Complete Study & Sign Off" : "Complete Study (Partial)"}
            aria-label="Complete Study & Sign Off"
            className={cn(
              "p-3 rounded-xl font-bold flex items-center justify-center shadow-lg shrink-0 border transition-all",
              isAllProceduresReported 
                ? "bg-success text-black border-success hover:bg-success/90" 
                : "bg-warning text-black border-warning hover:bg-warning/90"
            )}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
          </button>
        </motion.div>
      )}

      {/* Procedure Selector Tabs */}
      <div className="glass-panel p-4">
        <label className="text-[10px] text-muted uppercase font-bold block mb-3">Select Ultrasound Procedure for Reporting</label>
        <div className="flex flex-wrap gap-3">
          {rawProcedures.map((proc, index) => {
            const origIdx = proc.originalIndex;
            const ws = origIdx === selectedIdx
              ? { ...worksheets[origIdx], clinicalHistory, findings, impression, pdfReports }
              : worksheets[origIdx];
            const isCompleted = ws?.status === 'Completed' || ws?.isFinalized;
            const hasContent = ws && (
              (ws.findings && ws.findings.replace(/<[^>]*>/g, '').trim().length > 0) ||
              (ws.impression && ws.impression.replace(/<[^>]*>/g, '').trim().length > 0) ||
              (ws.pdfReports && ws.pdfReports.length > 0)
            );
            const isSelected = origIdx === selectedIdx;

            return (
              <button
                key={index}
                onClick={() => switchProcedure(origIdx)}
                className={cn(
                  "px-4 py-2 rounded-xl border text-xs font-bold transition-all relative",
                  isSelected 
                    ? "bg-primary text-black border-primary ring-2 ring-primary/20" 
                    : isCompleted
                      ? "bg-success/20 border-success/30 text-success"
                      : hasContent
                        ? "bg-warning/20 border-warning/30 text-warning"
                        : "bg-white/5 border-white/10 text-muted hover:bg-white/10"
                )}
              >
                <div className="flex items-center gap-2">
                  {proc.name}
                  {isCompleted && <CheckCircle2 className="w-3 h-3 text-success" />}
                </div>
                {hasContent && !isCompleted && <span className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />}
              </button>
            );
          })}
        </div>
      </div>



      {/* Main Grid Content Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left 2 Columns: Large Rich Text Editors */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Clinical History */}
          <div className="p-6 rounded-2xl border border-white/5 bg-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-primary block pb-1 border-b border-white/5">
              Clinical History
            </label>
            <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10">
              <ReactQuill 
                theme="snow"
                value={clinicalHistory}
                onChange={setClinicalHistory}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder="Enter clinical indications or patient referral summary..."
                className="quill-dark"
              />
            </div>
          </div>

          {/* Ultrasound Findings */}
          <div className="p-6 rounded-2xl border border-white/5 bg-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-primary block pb-1 border-b border-white/5">
              Detailed Ultrasound Findings
            </label>
            <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10 min-h-[300px]">
              <ReactQuill 
                theme="snow"
                value={findings}
                onChange={setFindings}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder="Describe anatomy, organs, measurements, parenchymal echo pattern and solid/cystic lesions..."
                className="quill-dark ql-findings"
              />
            </div>
          </div>

          {/* Diagnostic Impression */}
          <div className="p-6 rounded-2xl border border-white/5 bg-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-primary block pb-1 border-b border-white/5">
              Diagnostic Impression (Summary)
            </label>
            <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10">
              <ReactQuill 
                theme="snow"
                value={impression}
                onChange={setImpression}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder="Overall summary of diagnostic findings and clinical synthesis..."
                className="quill-dark"
              />
            </div>
          </div>

        </div>

        {/* Right 1 Column: history references & actions */}
        <div className="space-y-6">
          
          {/* Document Upload Block - identical to Radiologist interface */}
          <div className="glass-panel p-8 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Document Upload</h3>
              
              {/* List of uploaded PDFs */}
              {pdfReports.length > 0 && (
                <div className="space-y-2 mb-4">
                  {pdfReports.map((pdf, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-success/10 rounded-lg border border-success/20">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-4 h-4 text-success shrink-0" />
                        <span className="text-[10px] font-medium truncate">{pdf.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const win = window.open();
                            if (win) {
                              const targetUrl = pdf.url || pdf.data;
                              win.document.write(`<iframe src="${targetUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                              win.document.title = pdf.name;
                            }
                          }}
                          className="p-1 hover:text-primary transition-colors"
                          title="Preview PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleRemovePdf(idx)}
                          className="p-1 hover:text-danger transition-colors"
                          title="Remove attached PDF"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative group">
                <input 
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfFileSelect}
                  className="hidden"
                  id="sonographer-pdf-upload"
                  disabled={selectedIdx === -1}
                />
                <label 
                  htmlFor="sonographer-pdf-upload"
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer",
                    "border-white/10 hover:border-primary/50 bg-white/5 text-muted hover:text-main",
                    selectedIdx === -1 && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {uploadingPdf ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                  <div className="text-center">
                    <p className="text-xs font-bold uppercase">Add PDF Report</p>
                    <p className="text-[10px] opacity-60">For the selected procedure</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Actions Block - identical to Radiologist interface */}
          <div className="glass-panel p-6 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2 pb-2 border-b border-white/5">
              <CheckCircle2 className="w-4 h-4 text-muted" />
              Actions
            </h4>

            <div className="grid grid-cols-4 gap-2.5">
              <button 
                onClick={handleSaveDraft}
                disabled={saving}
                title="Save Draft"
                aria-label="Save Draft"
                className="glass-btn bg-white/5 text-main font-bold p-3 flex items-center justify-center rounded-xl"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              </button>
              <button 
                onClick={handleFinalizeProcedure}
                disabled={saving}
                title="Finalize Procedure Worksheet"
                aria-label="Finalize Procedure Worksheet"
                className="glass-btn bg-success/20 border-success/30 text-success font-bold p-3 flex items-center justify-center rounded-xl hover:bg-success/30"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => previewProfessionalReport(selectedIdx)}
                disabled={saving}
                title="Preview Professional PDF"
                aria-label="Preview Professional PDF"
                className="glass-btn bg-primary/20 text-primary border-primary/30 font-bold p-3 flex items-center justify-center rounded-xl hover:bg-primary/30"
              >
                <Eye className="w-5 h-5" />
              </button>
              {isAnyProcedureReported && (
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  title={isAllProceduresReported ? 'Complete Study & Sign Off' : 'Complete Study (Partial)'}
                  aria-label="Complete Study & Sign Off"
                  className={cn(
                    "glass-btn font-bold p-3 flex items-center justify-center rounded-xl shadow-lg transition-colors duration-200 border",
                    isAllProceduresReported 
                      ? "bg-success text-black border-success hover:bg-success/90" 
                      : "bg-warning text-black border-warning hover:bg-warning/90"
                  )}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>


          {/* PDF Preview Actions */}
          <div className="p-6 rounded-2xl border border-white/5 bg-white/5 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2 pb-2 border-b border-white/5">
              <FileText className="w-4 h-4 text-muted" />
              Individual PDF Previews
            </h4>
            <div className="space-y-2.5">
              {rawProcedures.map((proc, index) => {
                const isSelected = proc.originalIndex === selectedIdx;
                return (
                  <button 
                    key={index}
                    onClick={() => {
                      previewProfessionalReport(proc.originalIndex);
                    }}
                    className={cn(
                      "glass-btn w-full py-3.5 flex items-center justify-center gap-2 rounded-xl transition-all text-xs border text-left px-4",
                      isSelected
                        ? "bg-primary/20 text-primary border-primary/35 font-extrabold"
                        : "bg-white/5 text-muted border-white/10 font-bold hover:bg-white/10 hover:text-main"
                    )}
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span className="truncate">Preview {proc.name || proc} PDF</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clinical Context Reference */}
          {(request?.clinicalInfo || request?.radiographerHistory) && (
            <div className="p-6 rounded-2xl border border-white/5 bg-white/5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2 pb-2 border-b border-white/5">
                <AlertCircle className="w-4 h-4 text-muted" />
                Clinical References
              </h4>
              {request?.clinicalInfo && (
                <div className="space-y-1.5">
                  <h5 className="text-[10px] uppercase font-bold tracking-wider text-muted font-sans animate-pulse">Reception Indications</h5>
                  <p className="text-xs text-muted bg-black/20 p-3 rounded-lg border border-white/5 italic leading-relaxed font-sans">
                    "{request.clinicalInfo}"
                  </p>
                </div>
              )}
              {request?.radiographerHistory && (
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <h5 className="text-[10px] uppercase font-bold tracking-wider text-muted font-sans font-bold">Radiographer Observations</h5>
                  <p className="text-xs text-muted bg-black/20 p-3 rounded-lg border border-white/5 italic leading-relaxed font-sans">
                    "{request.radiographerHistory}"
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      <StudyTakeoverModal
        isOpen={takeoverModalOpen}
        activeReporterName={activeReporterInfo?.name || 'Another clinician'}
        activeReporterRole={activeReporterInfo?.role || 'sonographer'}
        patientName={patient?.name}
        patientId={patientId}
        procedureName={request?.modalities?.join(', ') || 'Ultrasound Study'}
        onConfirmTakeover={handleConfirmTakeover}
        onCancel={handleCancelTakeover}
      />
    </div>
  );
}
