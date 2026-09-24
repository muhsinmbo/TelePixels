import React, { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, collection, getDocs, doc, updateDoc, addDoc, setDoc, getDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../lib/utils';
import { FileText, Eye, CheckCircle, User, AlertCircle, Monitor, Search, Upload, X, Loader2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { logAction } from '../services/loggerService';
import { StudyTakeoverModal } from '../components/StudyTakeoverModal';

import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { generateProfessionalPDF } from '../services/reportPdfService';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

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

interface Procedure {
  id?: string;
  name?: string;
  partName?: string;
  procedureName?: string;
  needsReport: boolean;
  laterality?: string;
  status?: string;
}

interface Request {
  id: string;
  patientId: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  modalities: string[];
  procedures: (string | Procedure)[];
  bodyParts?: string;
  laterality?: string;
  status: string;
  priority: string;
  createdAt: string;
  uploadedAt?: string;
  radiographerHistory?: string;
  clinicalInfo?: string;
  sonographerWorksheet?: any;
  imageCount?: number;
  facilityId: string;
  accessCode?: string;
  radiologistId?: string;
  radiologistName?: string;
  activeReporter?: {
    uid?: string;
    name?: string;
    role?: string;
    updatedAt?: string;
  };
}

import DateFilterDropdown from '../components/DateFilterDropdown';
import FilterDropdown from '../components/FilterDropdown';
import { Filter } from 'lucide-react';

export default function ReportingInterface() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('today');
  const [sortField, setSortField] = useState<'date' | 'name' | 'priority'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const renderModalityBadges = (modalities: string[]) => {
    if (!modalities || modalities.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {modalities.map(m => {
          const norm = m.trim().toLowerCase();
          let classes = "bg-slate-500/10 text-slate-400 border border-slate-500/20";
          if (norm === 'x-ray' || norm === 'xray' || norm === 'xr') {
            classes = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
          } else if (norm === 'mammography' || norm === 'mg' || norm === 'mammo') {
            classes = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
          } else if (norm === 'ultrasound' || norm === 'us') {
            classes = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          } else if (norm === 'ct') {
            classes = "bg-violet-500/10 text-violet-400 border border-violet-500/20";
          } else if (norm === 'mr' || norm === 'mri') {
            classes = "bg-pink-500/10 text-pink-400 border border-pink-500/20";
          }
          return (
            <span key={m} className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", classes)}>
              {m}
            </span>
          );
        })}
      </div>
    );
  };

  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedProcedureIdx, setSelectedProcedureIdx] = useState<number>(-1);
  const [report, setReport] = useState({ clinicalHistory: '', findings: '', impression: '', isCritical: false });
  const [pdfReports, setPdfReports] = useState<{ name: string; data: string }[]>([]);
  const [existingReports, setExistingReports] = useState<Record<number, any>>({});
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });
  const [showLiability, setShowLiability] = useState(false);

  // Concurrent reporting lock modal state
  const [takeoverModalOpen, setTakeoverModalOpen] = useState(false);
  const [pendingTakeoverRequest, setPendingTakeoverRequest] = useState<Request | null>(null);
  const [activeReporterInfo, setActiveReporterInfo] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    const q = query(
      collectionGroup(db, 'requests'), 
      where('status', 'in', ['images uploaded', 'in progress', 'Images Uploaded', 'In Progress', 'Partially Reported']),
      where('needsReport', '==', true),
      where('facilityId', '==', 'default-facility')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchPromises = snapshot.docs.map(async (requestDoc) => {
          const reqData = { ...requestDoc.data(), id: requestDoc.id } as Request;
          const patientId = requestDoc.ref.parent.parent?.id;
          
          if (patientId) {
            try {
              const patientDoc = await getDoc(doc(db, 'patients', patientId));
              const pData = patientDoc.exists() ? patientDoc.data() : null;
              
              const patientName = pData ? pData.name : 'Unknown Patient';
              const patientAge = pData ? pData.age : undefined;
              const patientGender = pData ? pData.gender : undefined;
              return { ...reqData, patientId, patientName, patientAge, patientGender };
            } catch (pErr) {
              console.error('Error fetching patient name:', pErr);
              return { ...reqData, patientId, patientName: 'Error Loading Name' };
            }
          }
          return { ...reqData, patientId: 'N/A', patientName: 'N/A' };
        });

        const data = (await Promise.all(fetchPromises)).filter(Boolean) as Request[];
        setRequests(data);
      } catch (err) {
        console.error('Error processing requests:', err);
        toast.error('Failed to load worklist data');
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("ReportingInterface Snapshot Error:", error);
      setLoading(false);
    });

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

    return () => {
      unsubscribe();
      unsubscribeGlobal();
    };
  }, [profile?.facilityId, profile?.role]);

  // Handle deep-linking from search params
  useEffect(() => {
    if (requests.length > 0) {
      const patientIdParam = searchParams.get('patientId');
      const requestIdParam = searchParams.get('requestId');
      
      if (patientIdParam && requestIdParam && !selectedRequest) {
        const found = requests.find(r => r.id === requestIdParam && r.patientId === patientIdParam);
        if (found) {
          handleStartReporting(found);
        }
      }
    }
  }, [requests, searchParams, selectedRequest]);

  // Load existing reports for the selected request
  useEffect(() => {
    if (!selectedRequest) {
      setExistingReports({});
      setSelectedProcedureIdx(-1);
      return;
    }

    const reportsRef = collection(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id, 'reports');
    const unsubscribe = onSnapshot(reportsRef, (snapshot) => {
      const reportsMap: Record<number, any> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.procedureIdx !== undefined) {
          // Keep finalized report over draft if both exist for same index
          if (!reportsMap[data.procedureIdx] || !data.isDraft) {
            reportsMap[data.procedureIdx] = { ...data, id: doc.id };
          }
        }
      });
      setExistingReports(reportsMap);

      // Auto-select first procedure that needs report if none selected
      if (selectedProcedureIdx === -1) {
        const procedures = selectedRequest.procedures || [];
        const firstIdx = procedures.findIndex((p: any) => typeof p === 'object' && p.needsReport);
        if (firstIdx !== -1) {
          setSelectedProcedureIdx(firstIdx);
        }
      }
    }, (err) => {
      console.error('Error listening to reports:', err);
    });

    return unsubscribe;
  }, [selectedRequest]);

  // Load selected report data when procedure changes
  useEffect(() => {
    if (selectedProcedureIdx === -1) return;

    const existingReport = existingReports[selectedProcedureIdx];
    if (existingReport) {
      setReport({
        clinicalHistory: existingReport.clinicalHistory || '',
        findings: existingReport.findings || '',
        impression: existingReport.impression || '',
        isCritical: existingReport.isCritical || false
      });
      setPdfReports(existingReport.pdfReports || []);
    } else {
      setReport({
        clinicalHistory: '',
        findings: '',
        impression: '',
        isCritical: false
      });
      setPdfReports([]);
    }
  }, [selectedProcedureIdx, existingReports, selectedRequest]);

  const proceedWithReporting = async (request: Request) => {
    setSelectedRequest(request);
    
    const reqRef = doc(db, 'patients', request.patientId, 'requests', request.id);
    await updateDoc(reqRef, { 
      status: 'In Progress',
      radiologistId: profile?.uid || 'radiologist',
      radiologistName: profile?.displayName || profile?.email || 'Radiologist',
      activeReporter: {
        uid: profile?.uid || 'radiologist',
        name: profile?.displayName || profile?.email || 'Radiologist',
        role: profile?.role || 'radiologist',
        updatedAt: new Date().toISOString()
      },
      updatedAt: serverTimestamp()
    });
  };

  const handleStartReporting = async (request: Request) => {
    if (!profile) return;
    
    try {
      // Check if someone else has already claimed it
      const latestReqDoc = await getDoc(doc(db, 'patients', request.patientId, 'requests', request.id));
      const latestData = latestReqDoc.data();
      const currentUserId = profile.uid;

      const activeReporter = latestData?.activeReporter;
      const legacyRadiologistId = latestData?.radiologistId;
      const legacyRadiologistName = latestData?.radiologistName;
      const reqStatus = latestData?.status;

      const isOccupiedByAnother = activeReporter
        ? (activeReporter.uid && activeReporter.uid !== currentUserId)
        : (legacyRadiologistId && legacyRadiologistId !== currentUserId && (reqStatus === 'In Progress' || reqStatus === 'in progress'));

      if (isOccupiedByAnother) {
        const reporterName = activeReporter?.name || legacyRadiologistName || 'Another clinician';
        const reporterRole = activeReporter?.role || 'radiologist';
        
        setPendingTakeoverRequest(request);
        setActiveReporterInfo({ name: reporterName, role: reporterRole });
        setTakeoverModalOpen(true);
        return;
      }

      await proceedWithReporting(request);
    } catch (err) {
      console.error('Error starting reporting:', err);
      // Fallback open if offline check fails
      await proceedWithReporting(request);
    }
  };

  const handleConfirmTakeover = async () => {
    if (!pendingTakeoverRequest) return;
    const targetReq = pendingTakeoverRequest;
    setTakeoverModalOpen(false);
    setPendingTakeoverRequest(null);
    await proceedWithReporting(targetReq);
    toast.success(`Taken over study for patient ${targetReq.patientName || targetReq.patientId}`);
  };

  const handleCancelTakeover = () => {
    setTakeoverModalOpen(false);
    setPendingTakeoverRequest(null);
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    // Individual file limit (~750KB because base64 adds 33% overhead, total doc limit is 1MB)
    if (file.size > 0.7 * 1024 * 1024) { 
      toast.error('File too large for database (Max 700KB). Large files require external storage.');
      return;
    }

    setUploadingPdf(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const newData = event.target?.result as string;
      setPdfReports(prev => [...prev, { name: file.name, data: newData }]);
      setUploadingPdf(false);
      toast.success('PDF report attached');
    };
    reader.onerror = () => {
      setUploadingPdf(false);
      toast.error('Failed to read PDF file');
    };
    reader.readAsDataURL(file);
  };

  const removePdf = (idx: number) => {
    setPdfReports(prev => prev.filter((_, i) => i !== idx));
  };

  const saveDraft = async () => {
    if (!selectedRequest || !profile || selectedProcedureIdx === -1) return;
    setSavingDraft(true);
    try {
      const draftId = `draft_${selectedProcedureIdx}`;
      const draftRef = doc(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id, 'reports', draftId);
      
      const procedure = (selectedRequest.procedures || [])[selectedProcedureIdx] as Procedure;
      const procedureName = procedure?.name || procedure?.partName || procedure?.procedureName || 'Unknown';

      await setDoc(draftRef, {
        clinicalHistory: report.clinicalHistory,
        findings: report.findings,
        impression: report.impression,
        isCritical: report.isCritical,
        pdfReports,
        radiologistId: profile.uid,
        radiologistName: profile.displayName,
        facilityName: facilityInfo.name || profile.facilityName,
        facilityLetterhead: facilityInfo.letterhead || profile.facilityLetterhead,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDraft: true,
        procedureIdx: selectedProcedureIdx,
        procedureName,
        accessCode: selectedRequest.accessCode || ''
      }, { merge: true });

      toast.success('Draft synchronized for ' + procedureName);
    } catch (error) {
      console.error(error);
      toast.error('Failed to sync draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const previewProfessionalReport = () => {
    if (!selectedRequest || selectedProcedureIdx === -1) {
      toast.error('Select a procedure first');
      return;
    }

    const procedure = (selectedRequest.procedures || [])[selectedProcedureIdx] as Procedure;
    if (!procedure) return;

    const procedureName = procedure.name || procedure.partName || procedure.procedureName || 'Unknown';

    try {
      const doc = generateProfessionalPDF({
        patient: {
          name: selectedRequest.patientName || 'Unknown',
          id: selectedRequest.patientId,
          age: selectedRequest.patientAge,
          gender: selectedRequest.patientGender
        },
        request: {
          createdAt: (selectedRequest.createdAt as any),
          id: selectedRequest.id
        },
        report: {
          procedureName,
          clinicalHistory: report.clinicalHistory,
          findings: report.findings,
          impression: report.impression,
          radiologistName: profile?.displayName || 'Radiologist'
        },
        facility: {
          name: facilityInfo.name || profile?.facilityName,
          letterhead: facilityInfo.letterhead || profile?.facilityLetterhead
        }
      });

      const pdfDataUrl = doc.output('datauristring');
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${pdfDataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        win.document.title = `Preview - ${procedureName}`;
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate preview');
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !profile || selectedProcedureIdx === -1) return;

    try {
      const reportsRef = collection(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id, 'reports');
      
      const procedure = (selectedRequest.procedures || [])[selectedProcedureIdx] as Procedure;
      const procedureName = procedure?.name || procedure?.partName || procedure?.procedureName || 'Unknown';

      await addDoc(reportsRef, {
        clinicalHistory: report.clinicalHistory,
        findings: report.findings,
        impression: report.impression,
        isCritical: report.isCritical,
        pdfReports,
        radiologistId: profile.uid,
        radiologistName: profile.displayName,
        facilityName: facilityInfo.name || profile.facilityName,
        facilityLetterhead: facilityInfo.letterhead || profile.facilityLetterhead,
        createdAt: serverTimestamp(),
        isDraft: false,
        procedureIdx: selectedProcedureIdx,
        procedureName,
        accessCode: selectedRequest.accessCode || ''
      });

      // Update procedures array in request
      const updatedProcedures = [...(selectedRequest.procedures || [])];
      updatedProcedures[selectedProcedureIdx] = {
        ...(procedure as object),
        status: 'Reported',
        radiologistId: profile.uid,
        radiologistName: profile.displayName,
        reportedAt: new Date().toISOString()
      } as any;

      // Check if all procedures that need report are reported
      const needsReport = updatedProcedures.filter((p: any) => typeof p === 'object' && p.needsReport);
      const reportedCount = needsReport.filter((p: any) => p.status === 'Reported').length;
      const allDone = reportedCount === needsReport.length;

      const reqRef = doc(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id);
      await updateDoc(reqRef, {
        procedures: updatedProcedures,
        status: 'Partially Reported',
        notificationSent: false,
        patientNotified: false,
        physicianNotified: false,
        completedAt: null,
        updatedAt: serverTimestamp(),
        radiologistId: profile.uid,
        radiologistName: profile.displayName,
        reportContent: `Reported: ${procedureName}`,
        hasPdfReport: pdfReports.length > 0 || Object.values(existingReports).some(r => r.pdfReports?.length > 0)
      });

      // Update local existingReports state
      setExistingReports(prev => ({
        ...prev,
        [selectedProcedureIdx]: { 
          ...report, 
          pdfReports, 
          isDraft: false, 
          procedureIdx: selectedProcedureIdx, 
          procedureName 
        }
      }));

      // Update local selectedRequest procedures to remain open in Partially Reported state
      setSelectedRequest(prev => prev ? { ...prev, procedures: updatedProcedures, status: 'Partially Reported' } : null);

      toast.success(`Report finalized for ${procedureName}!`);
      
      logAction({
        action: 'REPORT_FINALIZE',
        details: `Finalized report for ${procedureName} (Patient: ${selectedRequest.patientName})`,
        targetId: selectedRequest.id
      });

      // Auto-select next procedure that needs report and isn't reported
      const nextIdx = updatedProcedures.findIndex((p: any, idx) => 
        typeof p === 'object' && p.needsReport && p.status !== 'Reported'
      );
      if (nextIdx !== -1) {
        setSelectedProcedureIdx(nextIdx);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to save report');
    }
  };

  const [completingStudy, setCompletingStudy] = useState(false);

  const handleCompleteStudy = async () => {
    if (!selectedRequest || !profile) return;
    try {
      setCompletingStudy(true);
      const reqRef = doc(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id);
      
      await updateDoc(reqRef, {
        status: 'Completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      toast.success('Study marked as Completed successfully!');
      
      logAction({
        action: 'REPORT_FINALIZE',
        details: `Marked study as completed (Patient: ${selectedRequest.patientName})`,
        targetId: selectedRequest.id
      });
      
      setSelectedRequest(null);
      setSearchParams({});
    } catch (error) {
      console.error(error);
      toast.error('Failed to complete study');
    } finally {
      setCompletingStudy(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.modalities.some(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesDate = () => {
      if (dateFilter === 'all') return true;
      let createdAtDate: Date;
      const rawDate = req.createdAt as any;
      if (rawDate && typeof rawDate.toDate === 'function') {
        createdAtDate = rawDate.toDate();
      } else {
        createdAtDate = new Date(rawDate);
      }
      if (isNaN(createdAtDate.getTime())) return true;
      const now = new Date();
      if (dateFilter === 'today') return createdAtDate.toDateString() === now.toDateString();
      if (dateFilter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return createdAtDate.toDateString() === yesterday.toDateString();
      }
      if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return createdAtDate >= weekAgo;
      }
      return true;
    };

    return matchesSearch && matchesDate();
  });

  const getRequestDate = (req: Request) => {
    const rawDate = req.uploadedAt || req.createdAt;
    if (!rawDate) return 0;
    if (typeof (rawDate as any).toDate === 'function') {
      return (rawDate as any).toDate().getTime();
    }
    return new Date(rawDate).getTime();
  };

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    const modifier = sortDirection === 'asc' ? 1 : -1;
    
    if (sortField === 'date') {
      const aTime = getRequestDate(a);
      const bTime = getRequestDate(b);
      return (aTime - bTime) * modifier;
    }
    
    if (sortField === 'name') {
      const aName = (a.patientName || '').toLowerCase();
      const bName = (b.patientName || '').toLowerCase();
      return aName.localeCompare(bName) * modifier;
    }
    
    if (sortField === 'priority') {
      const priorityScore = (p: string) => p === 'STAT' ? 3 : p === 'urgent' ? 2 : 1;
      return (priorityScore(a.priority) - priorityScore(b.priority)) * modifier;
    }
    
    return 0;
  });

  if (selectedRequest) {
    const needsReportProcs = (selectedRequest.procedures || []).filter((p: any) => typeof p === 'object' && p.needsReport);
    const reportedProcsCount = needsReportProcs.filter((p: any) => p.status === 'Reported').length;
    const isAnyProcedureReported = reportedProcsCount > 0;
    const isAllProceduresReported = needsReportProcs.length > 0 && reportedProcsCount === needsReportProcs.length;

    return (
      <div className="space-y-8 w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Diagnostic Report</h1>
            <p className="text-muted">
              Patient: <span className="text-main font-bold">{selectedRequest.patientName}</span> • 
              ID: {selectedRequest.patientId} • 
              {selectedRequest.patientAge}Y / {selectedRequest.patientGender === 'Male' ? 'M' : 'F'}
            </p>
          </div>

          <div className="flex-1 bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase text-danger mb-1">Developer Liability Notice</p>
              <p className="text-[10px] text-danger/80 leading-tight">
                This report builder is a prototype. NOT FOR OFFICIAL CLINICAL DIAGNOSIS. The developer disclaims all liability for the accuracy or clinical validity of any findings entered here.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setSelectedRequest(null);
                setSearchParams({}); // Clear params when going back to list
              }}
              className="glass-btn bg-white/5 text-muted hover:text-main px-4 py-2 text-xs font-bold"
            >
              Back to List
            </button>
            <button
              onClick={previewProfessionalReport}
              disabled={selectedProcedureIdx === -1}
              title="Preview Professional PDF"
              aria-label="Preview Professional PDF"
              className="p-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all flex items-center justify-center shrink-0 disabled:opacity-40"
            >
              <Eye className="w-5 h-5" />
            </button>
            {isAnyProcedureReported && (
              <button
                onClick={handleCompleteStudy}
                disabled={completingStudy}
                title={isAllProceduresReported ? "Complete Study & Sign Off" : "Complete Study (Partial)"}
                aria-label="Complete Study & Sign Off"
                className={cn(
                  "p-2.5 rounded-xl font-bold flex items-center justify-center shadow-lg transition-colors duration-200 border shrink-0",
                  isAllProceduresReported 
                    ? "bg-success text-black border-success hover:bg-success/90" 
                    : "bg-warning text-black border-warning hover:bg-warning/90"
                )}
              >
                {completingStudy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Procedure Selector */}
        <div className="glass-panel p-4">
          <label className="text-[10px] text-muted uppercase font-bold block mb-3">Select Procedure for Reporting</label>
          <div className="flex flex-wrap gap-3">
            {(selectedRequest.procedures || []).map((proc: any, idx) => {
              if (typeof proc !== 'object' || !proc.needsReport) return null;
              const isReported = proc.status === 'Reported' || (existingReports[idx] && !existingReports[idx].isDraft);
              const isDraft = existingReports[idx]?.isDraft;
              const pName = proc.name || proc.partName || proc.procedureName || 'Unknown';
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedProcedureIdx(idx)}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-xs font-bold transition-all relative",
                    selectedProcedureIdx === idx 
                      ? "bg-primary text-black border-primary ring-2 ring-primary/20" 
                      : isReported
                        ? "bg-success/20 border-success/30 text-success"
                        : isDraft
                          ? "bg-warning/20 border-warning/30 text-warning"
                          : "bg-white/5 border-white/10 text-muted hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {pName}
                    {proc.laterality && <span className="opacity-60 text-[10px]">({proc.laterality})</span>}
                    {isReported && <CheckCircle className="w-3 h-3" />}
                  </div>
                  {isDraft && !isReported && <span className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

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
              <CheckCircle className={cn("w-6 h-6 mt-0.5 shrink-0", isAllProceduresReported ? "text-success" : "text-warning")} />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-1">
                  {isAllProceduresReported ? "All Reports Finalized" : "Reports In Progress"}
                </h3>
                <p className="text-xs opacity-90 leading-relaxed max-w-xl">
                  {isAllProceduresReported 
                    ? "Every required diagnostic procedure in this study has been finalized. Click the button to formally complete and sign off the case, which will archive it from your active worklist."
                    : `You have completed ${reportedProcsCount} of ${needsReportProcs.length} reports. While you can finalize the study at any time, we recommend finishing all first, but you can sign off at any stage.`
                  }
                </p>
              </div>
            </div>
            
            <button
              onClick={handleCompleteStudy}
              disabled={completingStudy}
              title={isAllProceduresReported ? "Complete Study & Sign Off" : "Complete Study (Partial)"}
              aria-label="Complete Study & Sign Off"
              className={cn(
                "p-3 rounded-xl font-bold flex items-center justify-center shadow-lg shrink-0 border transition-all",
                isAllProceduresReported 
                  ? "bg-success text-black border-success hover:bg-success/90" 
                  : "bg-warning text-black border-warning hover:bg-warning/90"
              )}
            >
              {completingStudy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle className="w-6 h-6" />
              )}
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
                Report Sections
                {selectedProcedureIdx !== -1 && (
                  <span className="text-sm font-normal text-muted italic">
                    Reporting: {(() => {
                      const proc = (selectedRequest.procedures || [])[selectedProcedureIdx] as Procedure;
                      return proc ? (proc.name || proc.partName || proc.procedureName || 'Unknown') : 'Unknown';
                    })()}
                  </span>
                )}
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold uppercase text-muted mb-2 block">Clinical History / Body Part Details</label>
                  <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10">
                    <ReactQuill 
                      theme="snow"
                      value={report.clinicalHistory}
                      onChange={val => setReport(prev => ({ ...prev, clinicalHistory: val }))}
                      modules={QUILL_MODULES}
                      formats={QUILL_FORMATS}
                      placeholder="Enter patient clinical history or specific body part details..."
                      readOnly={selectedProcedureIdx === -1}
                      className="quill-dark"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-muted mb-2 block">Findings</label>
                  <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10 min-h-[300px]">
                    <ReactQuill 
                      theme="snow"
                      value={report.findings}
                      onChange={val => setReport(prev => ({ ...prev, findings: val }))}
                      modules={QUILL_MODULES}
                      formats={QUILL_FORMATS}
                      placeholder="Enter detailed diagnostic findings..."
                      readOnly={selectedProcedureIdx === -1}
                      className="quill-dark ql-findings"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-6">Impression</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10">
                <ReactQuill 
                  theme="snow"
                  value={report.impression}
                  onChange={val => setReport(prev => ({ ...prev, impression: val }))}
                  modules={QUILL_MODULES}
                  formats={QUILL_FORMATS}
                  placeholder="Enter diagnostic impression..."
                  readOnly={selectedProcedureIdx === -1}
                  className="quill-dark"
                />
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-6">Study Info</h2>
              <div className="space-y-4 text-sm">
          <button 
            onClick={() => navigate(`/viewer?patientId=${selectedRequest.patientId}&requestId=${selectedRequest.id}`)}
            className="glass-btn bg-primary/20 text-primary font-bold w-full flex items-center justify-center gap-2 mb-4 hover:bg-primary/30"
          >
            <Monitor className="w-4 h-4" />
            Switch to Image Viewer
          </button>
                <div className="space-y-1">
                  <p className="text-muted uppercase text-[10px] font-bold">Modality</p>
                  {renderModalityBadges(selectedRequest.modalities || [])}
                </div>
                {selectedRequest.bodyParts && (
                  <div>
                    <p className="text-muted uppercase text-[10px] font-bold">Body Part(s)</p>
                    <p className="text-main font-medium">{selectedRequest.bodyParts} ({selectedRequest.laterality})</p>
                  </div>
                )}
                <div>
                  <p className="text-muted uppercase text-[10px] font-bold">Priority</p>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                    selectedRequest.priority === 'STAT' ? "bg-danger/20 text-danger" : "bg-primary/20 text-primary"
                  )}>
                    {selectedRequest.priority}
                  </span>
                </div>
                {(selectedRequest.clinicalInfo || selectedRequest.radiographerHistory || selectedRequest.sonographerWorksheet || (selectedRequest as any).sonographerWorksheets) && (
                  <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                    {selectedRequest.clinicalInfo && (
                      <div>
                        <p className="text-muted uppercase text-[10px] font-bold mb-1.5">Reception History</p>
                        <div className="p-3 bg-white/5 rounded-lg text-xs leading-relaxed italic text-muted">
                          "{selectedRequest.clinicalInfo}"
                        </div>
                      </div>
                    )}
                    {selectedRequest.radiographerHistory && (
                      <div>
                        <p className="text-muted uppercase text-[10px] font-bold mb-1.5">Radiographer Observations</p>
                        <div className="p-3 bg-white/5 rounded-lg text-xs leading-relaxed italic text-muted">
                          "{selectedRequest.radiographerHistory}"
                        </div>
                      </div>
                    )}
                    {(() => {
                      const sonographerWorksheets = (selectedRequest as any).sonographerWorksheets || {};
                      const activeWS = sonographerWorksheets[selectedProcedureIdx] || (selectedProcedureIdx === 0 ? selectedRequest.sonographerWorksheet : null);
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
                        <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-primary uppercase text-[10px] font-black tracking-wider">Sonographer Ultrasound Worksheet</p>
                            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black uppercase">
                              {activeWS.type?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] space-y-2 text-[var(--text-main)]">
                            {activeWS.measurements && Object.keys(activeWS.measurements).length > 0 && (
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] bg-[var(--text-main)]/5 p-2.5 rounded-lg border border-[var(--text-main)]/10 text-[var(--text-main)]">
                                {Object.entries(activeWS.measurements).map(([key, val]) => {
                                  if (!val) return null;
                                  const beautifiedKeys: Record<string, string> = {
                                    fhr: 'Fetal Heart Rate',
                                    bpd: 'Biparietal Diam (BPD)',
                                    fl: 'Femur Length (FL)',
                                    ac: 'Abdom Circ (AC)',
                                    hc: 'Head Circ (HC)',
                                    afi: 'Amniotic Fluid (AFI)',
                                    placenta: 'Placenta Location',
                                    gestAge: 'Gestational Age',
                                    edd: 'Est Delivery Date',
                                    liverSize: 'Liver Size',
                                    liverEchogenicity: 'Liver Echo',
                                    gallbladder: 'Gallbladder',
                                    cbd: 'CBD Diameter',
                                    rKidney: 'Right Kidney',
                                    lKidney: 'Left Kidney',
                                    spleenSize: 'Spleen Size',
                                    pancreas: 'Pancreas',
                                    uterusL: 'Uterus Length',
                                    uterusW: 'Uterus Width',
                                    uterusH: 'Uterus Height',
                                    endoThickness: 'Endometrium Thickness',
                                    rOvary: 'Right Ovary',
                                    lOvary: 'Left Ovary',
                                    freeFluid: 'Free Fluid'
                                  };
                                  const label = beautifiedKeys[key] || key;
                                  let suffix = '';
                                  if (['bpd', 'fl', 'ac', 'hc', 'cbd', 'endoThickness'].includes(key)) suffix = ' mm';
                                  if (['afi', 'liverSize', 'rKidney', 'lKidney', 'spleenSize', 'uterusL', 'uterusW', 'uterusH'].includes(key)) suffix = ' cm';
                                  if (key === 'fhr') suffix = ' bpm';
                                  return (
                                    <div key={key} className="flex justify-between border-b border-[var(--text-main)]/5 py-1">
                                      <span className="text-[var(--text-muted)] text-[10px] pr-2">{label}:</span>
                                      <span className="text-[var(--text-main)] font-bold">{String(val)}{suffix}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {cleanedComments && (
                              <div className="pt-1">
                                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold mb-1">Observation Notes</p>
                                <p className="text-xs leading-relaxed italic text-[var(--text-main)] p-3 bg-[var(--text-main)]/5 rounded-lg border border-[var(--text-main)]/10 whitespace-pre-wrap font-medium">
                                  "{cleanedComments}"
                                </p>
                              </div>
                            )}

                            {((activeWS.pdfReports && activeWS.pdfReports.length > 0) || activeWS.pdfUrl || activeWS.uploadedPdfUrl) && (
                              <div className="pt-2">
                                <p className="text-[10px] text-primary uppercase font-bold mb-1.5 flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />
                                  Attached Sonographer PDF(s)
                                </p>
                                <div className="space-y-1.5">
                                  {(activeWS.pdfReports && activeWS.pdfReports.length > 0 
                                    ? activeWS.pdfReports 
                                    : [{ name: activeWS.pdfFileName || 'Sonographer_Attached_Report.pdf', data: activeWS.pdfUrl || activeWS.uploadedPdfUrl, url: activeWS.pdfUrl || activeWS.uploadedPdfUrl }]
                                  ).map((pdfItem: any, pdfIdx: number) => (
                                    <button
                                      key={pdfIdx}
                                      type="button"
                                      onClick={() => {
                                        const targetUrl = pdfItem.url || pdfItem.data;
                                        if (targetUrl) {
                                          const win = window.open();
                                          if (win) {
                                            win.document.write(`<iframe src="${targetUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                            win.document.title = pdfItem.name || 'Sonographer PDF Report';
                                          }
                                        }
                                      }}
                                      className="flex items-center justify-between p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs w-full transition-colors text-left font-medium"
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText className="w-4 h-4 shrink-0 text-primary" />
                                        <span className="truncate text-xs">{pdfItem.name || 'Attached PDF Report'}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[11px] font-bold shrink-0">
                                        <span>View</span>
                                        <Eye className="w-3.5 h-3.5" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="text-[9px] text-[var(--text-muted)]/80 text-right pt-1.5 border-t border-[var(--text-main)]/10">
                              Recorded by {activeWS.sonographerName || 'Sonographer'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

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
                        <button 
                          onClick={() => removePdf(idx)}
                          className="p-1 hover:text-danger transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative group">
                  <input 
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                    id="pdf-upload"
                    disabled={selectedProcedureIdx === -1}
                  />
                  <label 
                    htmlFor="pdf-upload"
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer",
                      "border-white/10 hover:border-primary/50 bg-white/5 text-muted hover:text-main",
                      selectedProcedureIdx === -1 && "opacity-50 cursor-not-allowed"
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

              <div className="flex items-center gap-3">
                <input 
                  type="checkbox"
                  id="isCritical"
                  checked={report.isCritical}
                  onChange={e => setReport(prev => ({ ...prev, isCritical: e.target.checked }))}
                  disabled={selectedProcedureIdx === -1}
                  className="w-5 h-5 rounded border-white/10 bg-black/30 text-danger focus:ring-danger"
                />
                <label htmlFor="isCritical" className="text-sm font-bold text-danger">Critical Finding Flag</label>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <button 
                  onClick={saveDraft}
                  disabled={savingDraft || selectedProcedureIdx === -1}
                  title="Save Draft"
                  aria-label="Save Draft"
                  className="glass-btn bg-white/5 text-main font-bold p-3 flex items-center justify-center rounded-xl"
                >
                  {savingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                </button>
                <button 
                  onClick={handleSubmitReport}
                  disabled={selectedProcedureIdx === -1}
                  title="Finalize Procedure Report"
                  aria-label="Finalize Procedure Report"
                  className="glass-btn bg-success/20 border-success/30 text-success font-bold p-3 flex items-center justify-center rounded-xl hover:bg-success/30 disabled:opacity-40"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button 
                  onClick={previewProfessionalReport}
                  disabled={selectedProcedureIdx === -1}
                  title="Preview Professional PDF"
                  aria-label="Preview Professional PDF"
                  className="glass-btn bg-primary/20 text-primary border-primary/30 font-bold p-3 flex items-center justify-center rounded-xl hover:bg-primary/30 disabled:opacity-40"
                >
                  <Eye className="w-5 h-5" />
                </button>
                {isAnyProcedureReported && (
                  <button 
                    onClick={handleCompleteStudy}
                    disabled={completingStudy}
                    title={isAllProceduresReported ? 'Complete Study & Sign Off' : 'Complete Study (Partial)'}
                    aria-label="Complete Study & Sign Off"
                    className={cn(
                      "glass-btn font-bold p-3 flex items-center justify-center rounded-xl shadow-lg transition-colors duration-200 border",
                      isAllProceduresReported 
                        ? "bg-success text-black border-success hover:bg-success/90" 
                        : "bg-warning text-black border-warning hover:bg-warning/90"
                    )}
                  >
                    {completingStudy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reporting Worklist</h1>
          <p className="text-muted">Studies ready for radiologist interpretation.</p>
        </div>
      </div>

      <div className="flex flex-col gap-0 overflow-visible relative">
        <div 
          onMouseEnter={() => setShowLiability(true)}
          onMouseLeave={() => setShowLiability(false)}
          className="relative transition-all duration-300"
        >
          {/* Small invisible sensor that triggers expansion when hovered completely above search tools */}
          {!showLiability && (
            <div className="h-2 w-full cursor-help" />
          )}

          <motion.div 
            initial={false}
            animate={{ 
              height: showLiability ? 'auto' : 0, 
              opacity: showLiability ? 1 : 0,
              marginBottom: showLiability ? 24 : 0
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-2 bg-danger/10 border border-danger/20 rounded-xl gap-2">
              <div className="flex items-center gap-2 text-danger">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">Liability Notice</span>
              </div>
              <p className="text-[10px] text-danger/80 leading-tight">
                THIS IS A PROTOTYPE TOOL. It is NOT certified for clinical use or medical diagnosis. All reports and findings generated here are for demonstration purposes only. The developer disclaims all liability for any medical errors or clinical actions arising from the use of this software.
              </p>
            </div>
          </motion.div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 overflow-visible relative z-50">
          <div className="glass-panel p-3 flex items-center gap-3 flex-1 overflow-visible relative z-30">
            <label htmlFor="reporting-search" className="sr-only">Search worklist</label>
            <Search className="text-muted w-5 h-5 ml-1" />
            <input 
              id="reporting-search"
              name="reportingSearch"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by Patient Name, ID, or Modality..."
              className="bg-transparent border-none focus:outline-none flex-1 text-main text-sm"
            />
          </div>

          <div className="flex items-center gap-2 overflow-visible relative z-50">
            <DateFilterDropdown 
              value={dateFilter} 
              onChange={setDateFilter} 
            />
          
            <FilterDropdown
              label="Sort"
              value={sortField}
              onChange={(val) => setSortField(val as any)}
              icon={Filter}
              options={[
                { value: 'date', label: 'Date' },
                { value: 'name', label: 'Name' },
                { value: 'priority', label: 'Priority' }
              ]}
            />
            <button 
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-2.5 rounded-lg bg-white/10 border border-white/20 text-muted hover:text-main transition-all shadow-lg"
              title={sortDirection === 'asc' ? "Sort Descending" : "Sort Ascending"}
            >
              <Filter className={cn("w-4 h-4", sortDirection === 'asc' ? "" : "transform rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-6 py-4 text-sm font-medium text-muted">Priority</th>
              <th className="px-6 py-4 text-sm font-medium text-muted">Patient Info</th>
              <th className="px-6 py-4 text-sm font-medium text-muted">Study Detail</th>
              <th className="px-6 py-4 text-sm font-medium text-muted text-center">Status</th>
              <th className="px-6 py-4 text-sm font-medium text-muted">Uploaded</th>
              <th className="px-6 py-4 text-sm font-medium text-muted text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">Loading worklist...</td></tr>
            ) : sortedRequests.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">No studies awaiting report matching filters</td></tr>
            ) : sortedRequests.map(request => (
              <tr key={request.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[10px] uppercase font-black px-2 py-1 rounded border",
                    request.priority === 'STAT' ? "bg-danger/10 text-danger border-danger/20" : 
                    request.priority === 'urgent' ? "bg-warning/10 text-warning border-warning/20" : "bg-primary/10 text-primary border-primary/20"
                  )}>
                    {request.priority}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted" />
                    </div>
                    <div>
                      <span className="font-bold block">{request.patientName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-primary/70">{request.patientId}</span>
                        <span className="text-muted text-[10px]">•</span>
                        <span className="text-muted text-[10px] font-medium">{request.patientAge}Y / {request.patientGender === 'Male' ? 'M' : 'F'}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-main uppercase tracking-tight leading-none bg-white/5 px-1.5 py-0.5 rounded">
                          {(() => {
                            const filtered = (request.procedures || []).filter((p: any) => typeof p === 'object' && p.needsReport);
                            if (filtered.length > 0) {
                              return filtered.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Unknown')).join(', ');
                            }
                            return (request.modalities || []).join(', ');
                          })()}
                        </span>
                       {request.imageCount !== undefined && request.imageCount > 0 && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">{request.imageCount} IMAGES</span>
                      )}
                    </div>
                    <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                      {renderModalityBadges(request.modalities || [])}
                      {request.bodyParts && (
                        <span>• {request.bodyParts} ({request.laterality})</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      (request.status === 'In Progress' || request.status === 'in progress') ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
                    )}>
                      {request.status}
                    </span>
                    {(request.status === 'In Progress' || request.status === 'in progress') && request.radiologistName && (
                      <span className="text-[9px] text-muted italic">By {request.radiologistName}</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-muted">
                    {formatDate(request.uploadedAt || request.createdAt)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-sm">
                    <button 
                      onClick={() => navigate(`/viewer?patientId=${request.patientId}&requestId=${request.id}`)}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-muted hover:text-main"
                      title="View in DICOM Viewer"
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleStartReporting(request)}
                      className="glass-btn p-2 bg-primary text-black flex items-center justify-center"
                      title={(request.status === 'In Progress' || request.status === 'in progress') ? 'Continue Report' : 'Start Report'}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StudyTakeoverModal
        isOpen={takeoverModalOpen}
        activeReporterName={activeReporterInfo?.name || 'Another clinician'}
        activeReporterRole={activeReporterInfo?.role || 'radiologist'}
        patientName={pendingTakeoverRequest?.patientName}
        patientId={pendingTakeoverRequest?.patientId}
        procedureName={(() => {
          if (!pendingTakeoverRequest) return undefined;
          const filtered = (pendingTakeoverRequest.procedures || []).filter((p: any) => typeof p === 'object' && p.needsReport);
          if (filtered.length > 0) {
            return filtered.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Unknown')).join(', ');
          }
          return (pendingTakeoverRequest.modalities || []).join(', ');
        })()}
        onConfirmTakeover={handleConfirmTakeover}
        onCancel={handleCancelTakeover}
      />
    </div>
  );
}
