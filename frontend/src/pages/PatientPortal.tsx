import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, NavLink } from 'react-router-dom';
import { doc, getDocs, collection, collectionGroup, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { logAction } from '../services/loggerService';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { 
  Search, 
  Image as ImageIcon, 
  FileText, 
  ChevronRight, 
  AlertCircle, 
  Loader2, 
  Download, 
  Eye, 
  X,
  Stethoscope,
  Calendar,
  User,
  ArrowRight,
  LogOut,
  Maximize2,
  CheckCircle2,
  Lock as LockIcon,
  Printer,
  ExternalLink,
  ShieldCheck,
  Check,
  Activity,
  Vote,
  Award,
  Info,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Pin
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { cn } from '../lib/utils';
import { generateProfessionalPDF, generateSonographerPDF } from '../services/reportPdfService';
import { useCornerstone } from '../hooks/useCornerstone';
import { useViewerStore } from '../store/useViewerStore';
import Toolbar from '../components/viewer/Toolbar';
import Viewport from '../components/viewer/Viewport';
import MetadataPanel from '../components/viewer/MetadataPanel';

interface PatientData {
  name: string;
  age: string | number;
  gender: string;
  id: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface RequestData {
  id: string;
  patientName: string;
  patientId: string;
  status: string;
  createdAt: any;
  accessCode: string;
  procedureName?: string;
  modalities?: string[];
  procedures?: any[];
  sonographerWorksheets?: any;
  sonographerWorksheet?: any;
  patientNotified?: boolean;
  physicianPhone?: string;
  physicianName?: string;
  physicianNotified?: boolean;
  radiographerHistory?: string;
  clinicalInfo?: string;
}

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

const getAttachedPdfs = (item: any): Array<{ name: string; data: string; url?: string }> => {
  if (!item) return [];
  const result: Array<{ name: string; data: string; url?: string }> = [];
  if (Array.isArray(item.pdfReports) && item.pdfReports.length > 0) {
    item.pdfReports.forEach((pdf: any, idx: number) => {
      if (pdf && (pdf.data || pdf.url)) {
        result.push({
          name: pdf.name || `Attached_Document_${idx + 1}.pdf`,
          data: pdf.data || pdf.url,
          url: pdf.url || pdf.data
        });
      }
    });
  }
  const singleUrl = item.pdfUrl || item.uploadedPdfUrl;
  if (singleUrl && !result.some(p => p.data === singleUrl || p.url === singleUrl)) {
    result.push({
      name: item.pdfFileName || 'Attached_Report.pdf',
      data: singleUrl,
      url: singleUrl
    });
  }
  return result;
};

const cleanTextContent = (val?: string): string => {
  if (!val) return '';
  return val.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const isWorkstationTextEdited = (item: any): boolean => {
  if (!item) return false;
  const ch = cleanTextContent(item.clinicalHistory);
  const fd = cleanTextContent(item.findings);
  const im = cleanTextContent(item.impression);
  const cm = cleanTextContent(item.comments);
  const cmNoPrefix = cm.replace(/^IMPRESSION:\s*/i, '').trim();
  return !!(ch || fd || im || cmNoPrefix);
};

export default function PatientPortal() {
  const { mrn: mrnFromPath, code: codeFromPath } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [mrn, setMrn] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [images, setImages] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [viewingReport, setViewingReport] = useState<any | null>(null);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [viewingWorksheet, setViewingWorksheet] = useState<any | null>(null);
  const [worksheetPdfUrl, setWorksheetPdfUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [theme, setTheme] = useState<'cyber' | 'teleradiology'>('teleradiology');
  const [attemptedUrlLogin, setAttemptedUrlLogin] = useState(false);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  // Initialize Cornerstone once inside the patient portal
  useCornerstone();

  // States for Referring Physician access and DICOM viewer
  const [showPhysicianAuthModal, setShowPhysicianAuthModal] = useState(false);
  const [physicianVerifyName, setPhysicianVerifyName] = useState(() => sessionStorage.getItem('physician_name') || '');
  const [physicianVerifyError, setPhysicianVerifyError] = useState('');
  const [physicianFacility, setPhysicianFacility] = useState(() => sessionStorage.getItem('physician_facility') || '');
  const [physicianGmail, setPhysicianGmail] = useState(() => sessionStorage.getItem('physician_gmail') || '');
  const [physicianPreference, setPhysicianPreference] = useState<'portal' | 'film' | ''>(() => (sessionStorage.getItem('physician_preference') as any) || '');
  const [isPhysicianConsentChecked, setIsPhysicianConsentChecked] = useState(false);
  const [isDicomViewerOpen, setIsDicomViewerOpen] = useState(false);
  const [isDicomHeaderCollapsed, setIsDicomHeaderCollapsed] = useState(true);
  const [isDicomControlsPinned, setIsDicomControlsPinned] = useState(false);
  const [isDicomControlsHovered, setIsDicomControlsHovered] = useState(false);
  const [dicomViewLayout, setDicomViewLayout] = useState<'1x1' | '2x2'>('1x1');
  const [isDicomSidebarOpen, setIsDicomSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [isDocVerified, setIsDocVerified] = useState(() => {
    return sessionStorage.getItem('is_physician_verified') === 'true';
  });

  // Physician study/survey states
  const [surveyPreference, setSurveyPreference] = useState('');
  const [surveyRecommendation, setSurveyRecommendation] = useState<number | null>(null);
  const [surveyNotes, setSurveyNotes] = useState('');
  const [surveySubmitted, setSurveySubmitted] = useState(() => {
    return sessionStorage.getItem('survey_submitted') === 'true';
  });
  const [isSurveySubmitting, setIsSurveySubmitting] = useState(false);
  const [showTimedSurveyPrompt, setShowTimedSurveyPrompt] = useState(false);
  const [hasPostponedSurvey, setHasPostponedSurvey] = useState(false);

  // Computed variables for ultrasound modality determination
  const registeredModalities = request?.modalities || [];
  const hasUltrasound = request ? (
    registeredModalities.includes('Ultrasound') || 
    request.procedureName?.toLowerCase().includes('ultrasound') ||
    request.procedures?.some((p: any) => {
      const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || '');
      return name.toLowerCase().includes('ultrasound');
    })
  ) : false;

  const hasOtherModalities = request ? (
    registeredModalities.some(m => m !== 'Ultrasound') ||
    request.procedures?.some((p: any) => {
      const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || '');
      return name.trim() !== '' && !name.toLowerCase().includes('ultrasound');
    })
  ) : false;

  const isStrictlyUltrasound = hasUltrasound && !hasOtherModalities;

  // Extract all available sonographer worksheets
  const getSonographerWorksheetsList = (): any[] => {
    if (!request) return [];
    const list: any[] = [];
    
    if (request.sonographerWorksheets && typeof request.sonographerWorksheets === 'object') {
      Object.entries(request.sonographerWorksheets).forEach(([idxKey, ws]: [string, any]) => {
        if (ws && (ws.findings || ws.impression || ws.comments || ws.pdfUrl || ws.uploadedPdfUrl || (Array.isArray(ws.pdfReports) && ws.pdfReports.length > 0))) {
          const procIndex = parseInt(idxKey);
          let procName = 'Ultrasound Exam';
          if (request.procedures && request.procedures[procIndex]) {
            const p = request.procedures[procIndex];
            procName = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound Exam');
          } else if (request.procedureName) {
            procName = request.procedureName;
          }
          list.push({
            ...ws,
            id: `sonographer_${idxKey}`,
            procedureName: procName
          });
        }
      });
    }
    
    if (list.length === 0 && request.sonographerWorksheet && (request.sonographerWorksheet.findings || request.sonographerWorksheet.impression || request.sonographerWorksheet.comments || request.sonographerWorksheet.pdfUrl || request.sonographerWorksheet.uploadedPdfUrl || (Array.isArray(request.sonographerWorksheet.pdfReports) && request.sonographerWorksheet.pdfReports.length > 0))) {
      list.push({
        ...request.sonographerWorksheet,
        id: 'sonographer_legacy',
        procedureName: request.procedureName || 'Ultrasound Exam'
      });
    }
    
    return list;
  };

  const openWorksheetViewer = async (ws: any) => {
    if (!request || !patient || !ws) return;
    setViewingWorksheet(ws);
    
    logAction({
      action: 'PORTAL_VIEW_STUDY',
      details: `Patient ${patient.name} (MRN: ${mrn}) viewed sonographer worksheet for procedure: ${ws.procedureName || 'Worksheet'}`,
      userId: mrn,
      userName: patient.name,
      userEmail: `mrn_${mrn}@portal.local`
    });

    if (ws.isAttachedPdf && ws.pdfFile) {
      setWorksheetPdfUrl(ws.pdfFile.data || ws.pdfFile.url || null);
      return;
    }

    const attachedPdfs = getAttachedPdfs(ws);
    const hasEditedText = isWorkstationTextEdited(ws);
    if (!hasEditedText && attachedPdfs.length > 0) {
      setWorksheetPdfUrl(attachedPdfs[0].data || attachedPdfs[0].url || null);
      return;
    }

    const targetPdf = ws.pdfUrl || ws.uploadedPdfUrl;
    if (targetPdf && !hasEditedText) {
      setWorksheetPdfUrl(targetPdf);
      return;
    }
    
    try {
      const docObj = generateSonographerPDF({ 
        patient, 
        request, 
        worksheet: ws,
        facility: {
          name: facilityInfo.name || 'Medical Facility',
          letterhead: facilityInfo.letterhead
        }
      });
      const pdfDataUrl = docObj.output('datauristring');
      setWorksheetPdfUrl(pdfDataUrl);
    } catch (err) {
      console.error('Failed to generate worksheet preview:', err);
    }
  };

  const closeWorksheetViewer = () => {
    setViewingWorksheet(null);
    setWorksheetPdfUrl(null);
  };

  const loadPhysicianViewer = () => {
    if (!patient || !request || images.length === 0) {
      toast.error("No imaging sequences are loaded for this study record.");
      return;
    }
    
    try {
      // Reset the store first
      useViewerStore.getState().reset();
      
      const imageIds = images.map(img => img.url || img.data).filter(Boolean);
      
      const imageMetadata: { [imageId: string]: any } = {};
      images.forEach(img => {
        const id = img.url || img.data;
        if (id) {
          imageMetadata[id] = {
            procedureName: img.procedureName || request.procedureName || 'Diagnostic Scan',
            bodyPart: img.dicomHeader?.bodyPart || 'Unknown',
            modality: img.dicomHeader?.modality || 'DX',
            sopInstanceUid: img.dicomHeader?.sopInstanceUid || 'N/A'
          };
        }
      });
      
      const firstDoc = images[0] || {};
      const newSeries = {
        id: request.id,
        name: `Seq ${request.id.slice(0, 8)}`,
        modality: firstDoc.dicomHeader?.modality || 'DX',
        date: firstDoc.dicomHeader?.studyDate || new Date().toISOString().slice(0, 10),
        patientName: patient.name,
        imageIds: imageIds,
        imageMetadata: imageMetadata,
        metadata: {
          patientId: patient.id,
          patientAge: patient.age,
          patientSex: patient.gender,
          studyInstanceUid: request.id,
          rows: firstDoc.dicomHeader?.rows || 512,
          columns: firstDoc.dicomHeader?.columns || 512,
          clinicalHistory: request.radiographerHistory || request.clinicalInfo || 'No history provided.',
          receptionistInfo: request.clinicalInfo || 'No notes.',
          procedures: request.procedures || []
        }
      };
      
      useViewerStore.getState().addSeries(newSeries);
      useViewerStore.getState().setSelectedSeriesId(newSeries.id);
      useViewerStore.getState().setViewportData(0, imageIds);
      
      setDicomViewLayout('1x1');
      useViewerStore.getState().setLayout('1x1');
      useViewerStore.getState().setActiveViewportIndex(0);
      
      setIsDicomViewerOpen(true);
      
      logAction({
        action: 'PORTAL_VIEW_STUDY',
        details: `Referring practitioner unlocked interactive DICOM viewer for patient ${patient.name} (MRN: ${mrn})`,
        userId: mrn,
        userName: `Dr. ${physicianVerifyName || request.physicianName || 'Referring Practitioner'}`,
        userEmail: `physician_${mrn}@portal.local`
      });
    } catch (err) {
      console.error("Failed to load DICOM viewport:", err);
      toast.error("Cornerstone setup failed to configure active series.");
    }
  };

  const handlePhysicianVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhysicianVerifyError('');

    if (!physicianVerifyName.trim()) {
      setPhysicianVerifyError('Please enter your full practitioner name (e.g. Dr. Kwabena Boateng).');
      return;
    }
    if (!physicianFacility.trim()) {
      setPhysicianVerifyError('Please specify your medical facility / practice.');
      return;
    }
    if (!physicianGmail.trim() && !sessionStorage.getItem('physician_gmail')) {
      setPhysicianVerifyError('Please enter your Gmail address to configure secure access.');
      return;
    }
    if (physicianGmail.trim() && (!physicianGmail.includes('@') || !physicianGmail.includes('.'))) {
      setPhysicianVerifyError('Please enter a valid Gmail address.');
      return;
    }

    setIsSurveySubmitting(true);
    try {
      const emailValue = physicianGmail.trim() || sessionStorage.getItem('physician_gmail') || '';
      
      // Save to Session Storage for fluid state persistence
      sessionStorage.setItem('is_physician_verified', 'true');
      sessionStorage.setItem('physician_name', physicianVerifyName.trim());
      sessionStorage.setItem('physician_facility', physicianFacility.trim());
      if (emailValue) {
        sessionStorage.setItem('physician_gmail', emailValue);
      }

      setIsDocVerified(true);
      setShowPhysicianAuthModal(false);
      
      const isAlreadySubmitted = sessionStorage.getItem('survey_submitted') === 'true';
      setSurveySubmitted(isAlreadySubmitted);

      toast.success("Welcome, doctor! Standard DICOM viewer initialized.");
      loadPhysicianViewer();
    } catch (err) {
      console.error("Clinical lock session activation failed:", err);
      setPhysicianVerifyError('Clinical verification server timeout. Please try again.');
    } finally {
      setIsSurveySubmitting(false);
    }
  };

  const handleSurveySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!surveyPreference) {
      toast.error("Please pick a clinical preference option before submitting.");
      return;
    }
    if (surveyRecommendation === null) {
      toast.error("Please select a recommendation rating.");
      return;
    }

    setIsSurveySubmitting(true);
    try {
      const currentGmail = physicianGmail || sessionStorage.getItem('physician_gmail') || '';
      const currentFacility = physicianFacility || sessionStorage.getItem('physician_facility') || '';
      const currentName = physicianVerifyName || sessionStorage.getItem('physician_name') || request?.physicianName || 'Referring Clinician';

      await logAction({
        action: 'PORTAL_FEEDBACK',
        details: JSON.stringify({
          practitionerName: currentName,
          gmail: currentGmail,
          facility: currentFacility,
          patientName: patient?.name,
          patientId: patient?.id,
          requestId: request?.id,
          preference: surveyPreference,
          nps: surveyRecommendation,
          usabilityNotes: surveyNotes,
          timestamp: new Date().toISOString()
        }),
        userId: mrn,
        userName: `Dr. ${currentName}`,
        userEmail: currentGmail || `physician_${mrn}@portal.local`
      });

      setSurveySubmitted(true);
      sessionStorage.setItem('survey_submitted', 'true');
      setShowTimedSurveyPrompt(false);
      setIsDicomViewerOpen(false); // Close the viewport as they requested to close it
      toast.success("Thank you! Your feedback has been securely transmitted and recorded in the audit logs.");
    } catch (err) {
      console.error("Survey submission failure:", err);
      toast.error("Failed to post feedback data. Please try again.");
    } finally {
      setIsSurveySubmitting(false);
    }
  };

  const handleDownloadWorksheet = async (ws: any) => {
    if (!request || !patient || !ws) return;
    if (ws.isAttachedPdf && ws.pdfFile) {
      handleDownloadPdfFile(ws.pdfFile, ws.procedureName);
      return;
    }
    setDownloading(`ws_${ws.id}`);
    
    if (isInAppBrowser) {
      toast("In-App browser (such as Google Lens/Social Apps) detected. Downloads might be sandboxed. To save files, tap three dots (⋮) and select 'Open in Safari/Chrome'.", { duration: 6000 });
    }

    try {
      logAction({
        action: 'PORTAL_DOWNLOAD_PDF',
        details: `Patient ${patient.name} (MRN: ${mrn}) downloaded sonographer worksheet PDF for procedure: ${ws.procedureName || 'Worksheet'}`,
        userId: mrn,
        userName: patient.name,
        userEmail: `mrn_${mrn}@portal.local`
      });

      const attachedPdfs = getAttachedPdfs(ws);
      const hasEditedText = isWorkstationTextEdited(ws);
      let pdfDataUrl = ws.pdfUrl || ws.uploadedPdfUrl;

      if (!hasEditedText && attachedPdfs.length > 0) {
        handleDownloadPdfFile(attachedPdfs[0], ws.procedureName);
        setDownloading(null);
        return;
      }

      const cleanFilename = `Sonographer_Report_${ws.procedureName?.replace(/\s+/g, '_') || 'Worksheet'}_${patient.id}.pdf`;

      if (!pdfDataUrl) {
        const docObj = generateSonographerPDF({ 
          patient, 
          request, 
          worksheet: ws,
          facility: {
            name: facilityInfo.name || 'Medical Facility',
            letterhead: facilityInfo.letterhead
          }
        });
        pdfDataUrl = docObj.output('datauristring');
      }

      if (pdfDataUrl.startsWith('http')) {
        try {
          const resp = await fetch(pdfDataUrl);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = cleanFilename;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
          }, 500);
          toast.success(`Download started for ${ws.procedureName || 'Ultrasound Report'}`);
          setDownloading(null);
          return;
        } catch (e) {
          const link = document.createElement('a');
          link.href = pdfDataUrl;
          link.download = cleanFilename;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => document.body.removeChild(link), 500);
          setDownloading(null);
          return;
        }
      }

      let blob: Blob;
      if (pdfDataUrl.startsWith('data:')) {
        const arr = pdfDataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        try {
          const bstr = atob(pdfDataUrl);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          blob = new Blob([u8arr], { type: 'application/pdf' });
        } catch (e) {
          blob = new Blob([pdfDataUrl], { type: 'application/pdf' });
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = cleanFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 200);

      toast.success(`Download started for worksheet: ${ws.procedureName}`);
    } catch (err: any) {
      console.warn('PDF client worksheet download failed, opening in print mode:', err);
      try {
        window.print();
        toast("Opening system print/save module as fallback...");
      } catch (err2) {
        toast.error('Could download. Please use Print / Save to capture files.');
      }
    } finally {
      setDownloading(null);
    }
  };

  // Detect in-app browsers like Google Lens, GSA, Instagram, FB webviews
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || "";
    // Google Lens userAgent includes GSA, Lens, etc.
    const isLensOrWebview = /Lens|GSA|FBAN|FBAV|Instagram|Messenger|Twitter|Line|WeChat|Pinterest|Snapchat|MicroMessenger|WebView|wv/i.test(ua);
    setIsInAppBrowser(isLensOrWebview);
  }, []);

  // Fetch Global Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemSettings', 'global'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const effectiveTheme = data.portalTheme || data.theme;
        if (effectiveTheme) setTheme(effectiveTheme);
        setFacilityInfo({
          name: data.facilityName || '',
          logo: data.facilityLogo || '',
          letterhead: data.facilityLetterhead || ''
        });
      }
    }, (error) => {
      console.warn('Portal settings listener failed:', error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (theme === 'teleradiology') {
      document.body.classList.add('theme-teleradiology');
    } else {
      document.body.classList.remove('theme-teleradiology');
    }
  }, [theme]);

  // Pre-fill clinician information when authorization modal is toggled
  useEffect(() => {
    if (showPhysicianAuthModal) {
      if (!physicianVerifyName && request?.physicianName) {
        setPhysicianVerifyName(`Dr. ${request.physicianName}`);
      }
      if (!physicianFacility && facilityInfo?.name) {
        setPhysicianFacility(facilityInfo.name);
      }
    }
  }, [showPhysicianAuthModal, request, facilityInfo]);

  const handleLogin = useCallback(async (e?: React.FormEvent, overrideMrn?: string, overrideCode?: string) => {
    if (e) e.preventDefault();
    const rawMrn = (overrideMrn || mrn).trim();
    const targetCode = (overrideCode || accessCode).trim();
    const targetMrn = rawMrn.toUpperCase();

    if (!rawMrn || !targetCode) return;

    setLoading(true);
    setError(null);

    try {
      let requestDoc: any = null;
      let requestData: RequestData | null = null;

      // 1. Primary check: specific patient requests collection (Uppercase MRN)
      let requestsRef = collection(db, 'patients', targetMrn, 'requests');
      let q = query(requestsRef, where('accessCode', '==', targetCode));
      let querySnapshot = await getDocs(q);

      // 2. Secondary check: raw MRN casing
      if (querySnapshot.empty && rawMrn !== targetMrn) {
        requestsRef = collection(db, 'patients', rawMrn, 'requests');
        q = query(requestsRef, where('accessCode', '==', targetCode));
        querySnapshot = await getDocs(q);
      }

      if (!querySnapshot.empty) {
        requestDoc = querySnapshot.docs[0];
        requestData = requestDoc.data() as RequestData;
      } else {
        // 3. Fallback: collectionGroup query across all requests by accessCode
        const groupQ = query(collectionGroup(db, 'requests'), where('accessCode', '==', targetCode));
        const groupSnap = await getDocs(groupQ);
        if (!groupSnap.empty) {
          const matchedDoc = groupSnap.docs.find(d => {
            const data = d.data() as RequestData;
            return data.patientId?.toUpperCase() === targetMrn || d.ref.parent?.parent?.id?.toUpperCase() === targetMrn;
          }) || groupSnap.docs[0];

          requestDoc = matchedDoc;
          requestData = matchedDoc.data() as RequestData;
        }
      }

      if (!requestDoc || !requestData) {
        throw new Error('Invalid Patient ID or Access Code. Please check your QR code or examination slip.');
      }

      if (['Completed', 'Finalized'].includes(requestData.status)) {
        if (!requestData.patientNotified) {
          const updateData: any = {
            patientNotified: true,
            updatedAt: serverTimestamp()
          };
          if (!requestData.physicianPhone || requestData.physicianNotified) {
            updateData.notificationSent = true;
          }
          updateDoc(requestDoc.ref, updateData).catch(err => console.error('Notification update failed:', err));
        }
      }

      const imagesSnapshot = await getDocs(collection(requestDoc.ref, 'images'));
      const imagesData = imagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setPatient({
        name: requestData.patientName,
        age: (requestData as any).patientAge,
        gender: (requestData as any).patientGender,
        id: requestData.patientId || targetMrn
      });
      setRequest({ id: requestDoc.id, ...requestData });
      setImages(imagesData);

      sessionStorage.setItem('portal_auth', JSON.stringify({ mrn: targetMrn, code: targetCode }));
      
      logAction({
        action: 'PORTAL_LOGIN',
        details: `Patient ${requestData.patientName} (MRN: ${targetMrn}) authenticated successfully into the patient portal via Access Code.`,
        userId: targetMrn,
        userName: requestData.patientName,
        userEmail: `mrn_${targetMrn}@portal.local`
      });
      
      if (searchParams.has('mrn') || mrnFromPath) {
        navigate('/portal', { replace: true });
      }
    } catch (err: any) {
      console.error('Portal Login Error:', err);
      setError(err.message || 'Authentication failed. Please verify your credentials.');
      sessionStorage.removeItem('portal_auth');
    } finally {
      setLoading(false);
    }
  }, [mrn, accessCode, navigate, searchParams, mrnFromPath]);

  // Handle URL params and Session Persistence
  useEffect(() => {
    if (request || loading || attemptedUrlLogin) return;

    const savedAuth = sessionStorage.getItem('portal_auth');
    const targetMrn = searchParams.get('mrn') || mrnFromPath;
    const targetCode = searchParams.get('code') || codeFromPath;
    
    if (targetMrn && targetCode) {
      setAttemptedUrlLogin(true);
      setMrn(targetMrn);
      setAccessCode(targetCode);
      handleLogin(undefined, targetMrn, targetCode);
    } else if (savedAuth) {
      try {
        const { mrn: sMrn, code: sCode } = JSON.parse(savedAuth);
        setMrn(sMrn);
        setAccessCode(sCode);
        handleLogin(undefined, sMrn, sCode);
      } catch (e) {
        sessionStorage.removeItem('portal_auth');
      }
    }
  }, [searchParams, mrnFromPath, codeFromPath, request, loading, attemptedUrlLogin, handleLogin]);

  // Real-time updates
  useEffect(() => {
    if (!request?.id || !patient?.id) return;
    
    const requestPath = `patients/${patient.id}/requests/${request.id}`;
    
    const unsubscribeImages = onSnapshot(collection(db, `${requestPath}/images`), (snapshot) => {
      setImages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'portal/images'));

    const unsubscribeRequest = onSnapshot(doc(db, requestPath), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as RequestData;
        setRequest({ id: snapshot.id, ...data });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'portal/request'));

    const unsubscribePatient = onSnapshot(doc(db, `patients/${patient.id}`), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPatient({
          name: data.name || patient.name,
          age: data.age !== undefined ? data.age : patient.age,
          gender: data.gender || patient.gender,
          id: data.id || patient.id,
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'portal/patient'));

    const qReports = query(collection(db, `${requestPath}/reports`), where('isDraft', '==', false), orderBy('createdAt', 'desc'));
    const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
      const reportsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReports(reportsData.sort((a: any, b: any) => (a.procedureIdx || 0) - (b.procedureIdx || 0)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'portal/reports'));

    return () => {
      unsubscribeImages();
      unsubscribeRequest();
      unsubscribePatient();
      unsubscribeReports();
    };
  }, [request?.id, patient?.id]);

  const handleDownloadImage = async (url: string, name: string) => {
    setDownloading(url);
    const cleanImgName = `${name?.replace(/\s+/g, '_') || 'medical-image'}.png`;
    
    if (isInAppBrowser) {
      toast("In-App browser (such as Google Lens/Social Apps) detected. Downloads might be sandboxed. To save files, tap the three dots (⋮) in the top right and select 'Open in Safari/Chrome'.", { duration: 6000 });
    }

    try {
      logAction({
        action: 'PORTAL_DOWNLOAD_IMAGE',
        details: `Patient ${patient?.name || 'Unknown'} (MRN: ${mrn}) downloaded medical plate image: ${cleanImgName}`,
        userId: mrn,
        userName: patient?.name || 'Patient Portal User',
        userEmail: `mrn_${mrn}@portal.local`
      });

      // First try to fetch the image to convert to a local blob. 
      // Local Blob URLs always support the HTML download attribute perfectly (even on mobile browsers).
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = cleanImgName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 150);
      toast.success('Image download started!');
    } catch (err: any) {
      console.warn('Direct image download failed, using standard anchor download fallback:', err);
      // Clean fallback: programmatically trigger standard direct save with the download attribute pointing directly to the URL
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = cleanImgName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          document.body.removeChild(link);
        }, 150);
        toast.success('Opening image for saving...');
      } catch (openErr) {
        toast.error('Could download. Please long-press the plate to save natively.');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadPdfFile = (file: { name: string; data: string; url?: string }, fallbackTitle?: string) => {
    const fileName = file.name || `${fallbackTitle || 'Attached_Report'}.pdf`;
    const pdfDataUrl = file.data || file.url || '';
    if (!pdfDataUrl) return;

    if (isInAppBrowser) {
      toast("In-App browser detected. Tap three dots (⋮) and select 'Open in Safari/Chrome' to save files.", { duration: 6000 });
    }

    try {
      if (pdfDataUrl.startsWith('data:')) {
        const arr = pdfDataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 200);
      } else if (pdfDataUrl.startsWith('http')) {
        fetch(pdfDataUrl)
          .then(r => r.blob())
          .then(b => {
            const blobUrl = URL.createObjectURL(b);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
            }, 200);
          })
          .catch(() => {
            const win = window.open(pdfDataUrl, '_blank');
            if (!win) window.location.href = pdfDataUrl;
          });
      } else {
        const win = window.open(pdfDataUrl, '_blank');
        if (!win) window.location.href = pdfDataUrl;
      }
      toast.success(`Download started for: ${fileName}`);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Could not download attached PDF.');
    }
  };

  const openReportViewer = async (report: any) => {
    if (!request || !patient || !report) return;
    setViewingReport(report);
    
    logAction({
      action: 'PORTAL_VIEW_STUDY',
      details: `Patient ${patient.name} (MRN: ${mrn}) viewed clinical report for procedure: ${report.procedureName || 'Report'}`,
      userId: mrn,
      userName: patient.name,
      userEmail: `mrn_${mrn}@portal.local`
    });

    if (report.isAttachedPdf && report.pdfFile) {
      setReportPdfUrl(report.pdfFile.data || report.pdfFile.url || null);
      return;
    }
    
    try {
      let pdfDataUrl = '';
      const attachedPdfs = getAttachedPdfs(report);
      const hasEditedText = isWorkstationTextEdited(report);

      if (!hasEditedText && attachedPdfs.length > 0) {
        pdfDataUrl = attachedPdfs[0].data || attachedPdfs[0].url || '';
      } else if (report.pdfReports?.length > 0 && !hasEditedText) {
        pdfDataUrl = report.pdfReports[0].data || report.pdfReports[0].url || '';
      } else {
        const doc = generateProfessionalPDF({ 
          patient, 
          request, 
          report,
          facility: {
            name: facilityInfo.name || report.facilityName || 'Medical Facility',
            letterhead: facilityInfo.letterhead || report.facilityLetterhead
          }
        });
        pdfDataUrl = doc.output('datauristring');
      }
      setReportPdfUrl(pdfDataUrl);
    } catch (err) {
      console.error('Failed to generate report preview:', err);
    }
  };

  const closeReportViewer = () => {
    setViewingReport(null);
    setReportPdfUrl(null);
  };

  const handleDownloadReport = (report: any) => {
    if (!request || !patient || !report) return;
    if (report.isAttachedPdf && report.pdfFile) {
      handleDownloadPdfFile(report.pdfFile, report.procedureName);
      return;
    }
    setDownloading(`report_${report.id}`);
    
    if (isInAppBrowser) {
      toast("In-App browser (such as Google Lens/Social Apps) detected. Downloads might be sandboxed. To save files, tap the three dots (⋮) in the top right and select 'Open in Safari/Chrome'.", { duration: 6000 });
    }

    try {
      logAction({
        action: 'PORTAL_DOWNLOAD_PDF',
        details: `Patient ${patient.name} (MRN: ${mrn}) downloaded clinical report PDF for procedure: ${report.procedureName || 'Report'}`,
        userId: mrn,
        userName: patient.name,
        userEmail: `mrn_${mrn}@portal.local`
      });

      let pdfDataUrl = '';
      if (report.pdfReports?.length > 0) {
        pdfDataUrl = report.pdfReports[0].data;
      } else {
        const doc = generateProfessionalPDF({ 
          patient, 
          request, 
          report,
          facility: {
            name: facilityInfo.name || report.facilityName || 'Medical Facility',
            letterhead: facilityInfo.letterhead || report.facilityLetterhead
          }
        });
        pdfDataUrl = doc.output('datauristring');
      }

      const cleanFilename = `Report_${report.procedureName?.replace(/\s+/g, '_') || 'Report'}_${patient.id}.pdf`;

      // Convert pdfDataUrl (whether base64 or complete data-uri string) to a direct binary Blob on the client
      let blob: Blob;
      if (pdfDataUrl.startsWith('data:')) {
        const arr = pdfDataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        try {
          const bstr = atob(pdfDataUrl);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          blob = new Blob([u8arr], { type: 'application/pdf' });
        } catch (e) {
          blob = new Blob([pdfDataUrl], { type: 'application/pdf' });
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = cleanFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 200);

      toast.success(`Download started for: ${report.procedureName}`);
    } catch (err: any) {
      console.warn('PDF client download execution failed, opening in print mode:', err);
      try {
        window.print();
        toast("Opening system print/save module as fallback...");
      } catch (err2) {
        toast.error('Could not download. Please use Print / Save to capture files.');
      }
    } finally {
      setDownloading(null);
    }
  };

  const handleCopyPortalLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Portal link copied! Paste it into Safari or Chrome to download.");
    } catch (err) {
      toast.error("Could not copy link automatically. Please copy the URL from the browser bar.");
    }
  };

  const handleSignOut = () => {
    if (patient) {
      logAction({
        action: 'PORTAL_LOGOUT',
        details: `Patient ${patient.name} (MRN: ${mrn}) logged out of the patient portal.`,
        userId: mrn,
        userName: patient.name,
        userEmail: `mrn_${mrn}@portal.local`
      });
    }
    setRequest(null);
    setPatient(null);
    setImages([]);
    setAccessCode('');
    sessionStorage.removeItem('portal_auth');
  };

  if (request) {
    return (
      <div className={cn(
        "min-h-screen bg-[var(--background)] text-[var(--text-main)] transition-colors duration-300",
        theme === 'cyber' && "bg-[#050505] text-white"
      )}>
        {/* Navigation Bar */}
        <nav className="sticky top-0 z-50 bg-[var(--glass-bg)] backdrop-blur-md border-b border-[var(--glass-border)] px-4 h-16 flex items-center justify-between">
          <NavLink to="/portal" className="flex items-center gap-3">
            <img 
              src={facilityInfo.logo || "/logo.png"} 
              alt={facilityInfo.name || "Facility Logo"} 
              className="h-8 w-auto object-contain" 
              referrerPolicy="no-referrer" 
            />
            <span className="text-sm font-black tracking-tight text-main uppercase italic hidden sm:block">
              {facilityInfo.name || "King's Diagnostic Imaging and Research Center"}
            </span>
          </NavLink>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider leading-none">Verified Patient</p>
              <p className="text-xs font-bold text-main">{patient?.name}</p>
            </div>
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/10 dark:bg-white/5 text-muted hover:bg-black/20 dark:hover:bg-white/10 transition-colors text-xs font-bold"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </nav>

        {/* WebView Warning Banner */}
        {isInAppBrowser && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-amber-500 text-xs sm:text-sm font-medium">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 animate-pulse text-amber-500" />
                <span className="leading-tight">
                  <strong>Restricted In-App Browser detected (Google Lens / GSA App).</strong> Image and PDF downloads are typically blocked by security sandboxes. To print or save files, please tap the options menu <strong>(three dots &bull;&bull;&bull;)</strong> in the top-right and select <strong>&quot;Open in Chrome&quot;</strong> or <strong>&quot;Open in Safari&quot;</strong>.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                <button
                  onClick={handleCopyPortalLink}
                  className="text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors"
                >
                  Copy Link
                </button>
                <button 
                  onClick={() => setIsInAppBrowser(false)} 
                  className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 hover:text-white px-2 py-1.5 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {/* Welcome Header */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row gap-6 items-start justify-between glass-panel p-6 md:p-8 overflow-hidden"
          >
            <div className="space-y-2 relative z-10">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {isStrictlyUltrasound ? "Ultrasound Worksheets Accessed" : "Medical Records Accessed"}
                </span>
              </div>
              <h2 className="text-2xl md:text-4xl font-black tracking-tight text-main">Welcome, {patient?.name?.split(' ')[0]}</h2>
              <p className="text-muted text-sm max-w-xl font-medium">
                {isStrictlyUltrasound ? (
                  "Your clinical sonographer ultrasound reports and worksheets are securely available below."
                ) : (
                  "Your medical charts, imaging results, and clinical interpretations are securely available below."
                )}
              </p>
            </div>
            
            <div className="flex gap-4 w-full md:w-auto relative z-10">
              <div className="flex-1 md:flex-none p-5 rounded-[2rem] bg-primary/10 border border-primary/20 flex flex-col justify-center">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] animate-pulse" />
                  <span className="text-sm font-black text-main">{request.status}</span>
                </div>
              </div>
              <div className="flex-1 md:flex-none p-5 rounded-[2rem] glass-panel border-white/10 flex flex-col justify-center shadow-none">
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1">Total</p>
                <p className="text-sm font-black text-main">
                  {isStrictlyUltrasound ? getSonographerWorksheetsList().length : (images.length + reports.length + (hasUltrasound ? getSonographerWorksheetsList().length : 0))} <span className="text-[10px] opacity-40">{isStrictlyUltrasound ? "Worksheets" : "Records"}</span>
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar / Info */}
            <div className="lg:col-span-4 space-y-6">
              <section className="glass-panel overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-main">
                    <User className="w-4 h-4 text-primary" />
                    Patient Information
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Full Name</p>
                      <p className="text-sm font-bold text-main">{patient?.name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Patient MRN</p>
                        <p className="text-sm font-mono font-bold text-main">{patient?.id}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Age / Gender</p>
                        <p className="text-sm font-bold text-main">{patient?.age || 'N/A'} / {patient?.gender || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Reference ID</p>
                    <p className="text-xs font-mono text-muted truncate">{request.id}</p>
                  </div>
                </div>
              </section>

              <section className="glass-panel overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-main">
                    <Calendar className="w-4 h-4 text-primary" />
                    Examination Timeline
                  </h3>
                </div>
                <div className="p-6">
                  {(() => {
                    const isCaseCompleted = reports.length > 0 || ['Completed', 'Finalized', 'Reported'].includes(request.status);
                    const hasImagesData = images.length > 0;
                    
                    let activeTimelineStep = 1;
                    if (isCaseCompleted) {
                      activeTimelineStep = 3;
                    } else if (hasImagesData) {
                      activeTimelineStep = 2;
                    } else {
                      activeTimelineStep = 1;
                    }

                    return (
                      <div className="relative space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-white/10">
                        
                        {/* Step 1: Study Registered */}
                        <div className="relative pl-8 flex flex-col gap-1.5 transition-all duration-300">
                          {activeTimelineStep === 1 ? (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] flex items-center justify-center">
                              {/* Glowing outer aura (continuous on-and-off breath) */}
                              <span className="absolute w-[24px] h-[24px] rounded-full bg-primary/20 border-2 border-primary/50 animate-ping opacity-60" style={{ animationDuration: '2.5s' }} />
                              {/* Inner active dot (on and off continuous animation) */}
                              <span className="absolute w-[16px] h-[16px] rounded-full bg-primary/30 border border-primary flex items-center justify-center animate-pulse">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary" />
                              </span>
                            </div>
                          ) : activeTimelineStep > 1 ? (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                              <Check className="w-3 h-3 text-primary stroke-[3]" />
                            </div>
                          ) : (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-muted/20" />
                            </div>
                          )}
                          
                          <p className={cn(
                            "text-xs font-bold transition-all duration-300", 
                            activeTimelineStep === 1 
                              ? "text-primary text-sm font-black" 
                              : "text-main"
                          )}>
                            {activeTimelineStep === 1 && "▶ "}Study Registered & Confirmed
                          </p>
                          <p className="text-[10px] text-muted-more">
                            {request.createdAt ? (
                              typeof request.createdAt === 'object' && 'seconds' in request.createdAt
                                ? new Date(request.createdAt.seconds * 1000).toLocaleString()
                                : new Date(request.createdAt as any).toLocaleString()
                            ) : ''}
                          </p>
                        </div>

                        {/* Step 2: Images Received & Processed */}
                        <div className="relative pl-8 flex flex-col gap-1.5 transition-all duration-300">
                          {activeTimelineStep === 2 ? (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] flex items-center justify-center">
                              {/* Glowing outer aura (continuous on-and-off breath) */}
                              <span className="absolute w-[24px] h-[24px] rounded-full bg-primary/20 border-2 border-primary/50 animate-ping opacity-60" style={{ animationDuration: '2.5s' }} />
                              {/* Inner active dot (on and off continuous animation) */}
                              <span className="absolute w-[16px] h-[16px] rounded-full bg-primary/30 border border-primary flex items-center justify-center animate-pulse">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary" />
                              </span>
                            </div>
                          ) : activeTimelineStep > 2 ? (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                              <Check className="w-3 h-3 text-primary stroke-[3]" />
                            </div>
                          ) : (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-muted/20" />
                            </div>
                          )}
                          
                          <p className={cn(
                            "text-xs font-bold transition-all duration-300", 
                            activeTimelineStep === 2 
                              ? "text-primary text-sm font-black animate-pulse" 
                              : activeTimelineStep > 2 
                                ? "text-main" 
                                : "text-muted"
                          )}>
                            {activeTimelineStep === 2 && "▶ "}{isStrictlyUltrasound ? "Ultrasound Scans Processed" : "Diagnostics & Film Processed"}
                          </p>
                          <p className="text-[10px] text-muted-more">
                            {images.length > 0 
                              ? `${images.length} high-resolution ${isStrictlyUltrasound ? "ultrasound scans" : "medical plates"} online` 
                              : (isStrictlyUltrasound ? 'Securing ultrasound scan link...' : 'Securing imaging system link...')}
                          </p>
                        </div>

                        {/* Step 3: Clinician Interpretation Completed */}
                        <div className="relative pl-8 flex flex-col gap-1.5 transition-all duration-300">
                          {activeTimelineStep === 3 ? (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] flex items-center justify-center">
                              {/* Glowing outer aura (continuous on-and-off breath) */}
                              <span className="absolute w-[24px] h-[24px] rounded-full bg-primary/20 border-2 border-primary/50 animate-ping opacity-60" style={{ animationDuration: '2.5s' }} />
                              {/* Inner active dot (on and off continuous animation) */}
                              <span className="absolute w-[16px] h-[16px] rounded-full bg-primary/30 border border-primary flex items-center justify-center animate-pulse">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary" />
                              </span>
                            </div>
                          ) : (
                            <div className="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-muted/20" />
                            </div>
                          )}
                          
                          <p className={cn(
                            "text-xs font-bold transition-all duration-300", 
                            activeTimelineStep === 3 
                              ? "text-primary text-sm font-black" 
                              : "text-muted"
                          )}>
                            {activeTimelineStep === 3 && "▶ "}{isStrictlyUltrasound ? "Interpretations & Worksheets Released" : "Interpretation & Reports Released"}
                          </p>
                          <p className="text-[10px] text-muted-more">
                            {reports.length > 0 
                              ? `${reports.length} official clinical report(s) signed off` 
                              : (isStrictlyUltrasound ? 'Pending final radiologist and sonographer sign-off' : 'Pending final radiologist authorization')}
                          </p>
                        </div>

                      </div>
                    );
                  })()}
                </div>
              </section>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-8 space-y-8">
              {/* Clinical Reports */}
              {!isStrictlyUltrasound && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-main">
                      <FileText className="w-5 h-5 text-primary" />
                      Medical Reports
                    </h3>
                    <div className="px-3 py-1 rounded-full bg-black/10 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-muted">
                      Official Results
                    </div>
                  </div>

                  {reports.length > 0 ? (
                    <div className="space-y-4">
                      {reports.map((report) => {
                        const attachedPdfs = getAttachedPdfs(report);
                        const hasEditedText = isWorkstationTextEdited(report);

                        // If workstation generator was NOT edited (no text entered into fields), but PDF is attached: ONLY show attached PDFs as separate files
                        if (!hasEditedText && attachedPdfs.length > 0) {
                          return attachedPdfs.map((pdfFile, pdfIdx) => (
                            <motion.div 
                              key={`${report.id}_pdf_${pdfIdx}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="group glass-panel p-6 hover:border-primary/50 transition-all cursor-pointer shadow-none"
                              onClick={() => openReportViewer({ ...report, procedureName: pdfFile.name || report.procedureName, isAttachedPdf: true, pdfFile })}
                            >
                              <div className="flex flex-col md:flex-row gap-6">
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                  <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary group-hover:scale-110 transition-transform" />
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-lg font-bold text-main leading-tight">
                                          {pdfFile.name || report.procedureName || 'Attached Medical Report'}
                                        </h4>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                          <FileText className="w-3 h-3" />
                                          Attached PDF File
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs font-bold text-muted mt-1">
                                        <Stethoscope className="w-3 h-3 text-primary" />
                                        <span>{report.radiologistName || 'Clinical Radiologist'}</span>
                                        <span className="text-[8px] opacity-30">•</span>
                                        <span>{report.procedureName || 'Medical Exam'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <p className="text-sm text-main/70 italic leading-relaxed">
                                    Attached diagnostic report document.
                                  </p>

                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openReportViewer({ ...report, procedureName: pdfFile.name || report.procedureName, isAttachedPdf: true, pdfFile }); }}
                                      className="px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-lg shadow-primary/20"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Review PDF
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDownloadPdfFile(pdfFile, pdfFile.name || report.procedureName); }}
                                      className="px-4 py-2 rounded-xl bg-black/10 dark:bg-white/5 text-muted text-xs font-bold flex items-center gap-2 hover:bg-black/20 dark:hover:bg-white/10 transition-colors"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      Get PDF
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ));
                        }

                        // Workstation text WAS edited -> Show auto-generated report card AND separate attached PDFs
                        return (
                          <React.Fragment key={report.id}>
                            <motion.div 
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="group glass-panel p-6 hover:border-primary/50 transition-all cursor-pointer shadow-none"
                              onClick={() => openReportViewer(report)}
                            >
                              <div className="flex flex-col md:flex-row gap-6">
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                  <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary group-hover:scale-110 transition-transform" />
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                                    <div>
                                      <h4 className="text-lg font-bold text-main leading-tight">
                                        {report.procedureName || 'Diagnostic Report'}
                                      </h4>
                                      <div className="flex items-center gap-2 text-xs font-bold text-muted mt-1">
                                        <Stethoscope className="w-3 h-3 text-primary" />
                                        <span>{report.radiologistName || 'Clinical Radiologist'}</span>
                                        <span className="text-[8px] opacity-30">•</span>
                                        <span>{report.createdAt && new Date(report.createdAt.seconds * 1000).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                    
                                    {report.isCritical && (
                                      <div className="px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest border border-red-500/20 flex items-center gap-1.5 self-start">
                                        <AlertCircle className="w-3 h-3" />
                                        Clinical Alert
                                      </div>
                                    )}
                                  </div>

                                  <p className="text-sm text-main/70 line-clamp-2 italic leading-relaxed">
                                    {stripHtml(report.impression) || 'Final interpretation results are available for review.'}
                                  </p>

                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openReportViewer(report); }}
                                      className="px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-lg shadow-primary/20"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Review Results
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDownloadReport(report); }}
                                      disabled={downloading === `report_${report.id}`}
                                      className="px-4 py-2 rounded-xl bg-black/10 dark:bg-white/5 text-muted text-xs font-bold flex items-center gap-2 hover:bg-black/20 dark:hover:bg-white/10 transition-colors"
                                    >
                                      {downloading === `report_${report.id}` ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Download className="w-3.5 h-3.5" />
                                      )}
                                      Get PDF
                                    </button>
                                  </div>

                                  {/* Render Attached PDFs as Separate File Items */}
                                  {attachedPdfs.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-white/10 space-y-2" onClick={(e) => e.stopPropagation()}>
                                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5" />
                                        Attached PDF File(s) ({attachedPdfs.length})
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {attachedPdfs.map((pdfFile, pdfIdx) => (
                                          <div 
                                            key={pdfIdx}
                                            className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-medium hover:bg-primary/20 transition-colors"
                                          >
                                            <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                                              <FileText className="w-4 h-4 text-primary shrink-0" />
                                              <span className="truncate font-bold text-main">{pdfFile.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                onClick={() => openReportViewer({ ...report, procedureName: pdfFile.name || report.procedureName, isAttachedPdf: true, pdfFile })}
                                                className="px-2.5 py-1.5 rounded-lg bg-primary text-black text-[11px] font-bold flex items-center gap-1 hover:bg-primary/80 transition-colors"
                                              >
                                                <Eye className="w-3 h-3" />
                                                View
                                              </button>
                                              <button
                                                onClick={() => handleDownloadPdfFile(pdfFile, pdfFile.name || report.procedureName)}
                                                className="p-1.5 rounded-lg bg-black/20 dark:bg-white/10 text-main hover:bg-black/30 transition-colors"
                                                title="Download PDF"
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="glass-panel p-12 border-dashed border-white/20 text-center space-y-4 shadow-none">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto opacity-50">
                        <FileText className="w-8 h-8 text-muted" />
                      </div>
                      <div>
                        <p className="text-main font-bold">Analysis in Progress</p>
                        <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed mt-1">
                          Our clinical experts are analyzing your examination results. 
                          You will be notified once they are available.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Sonographer Ultrasound Worksheets */}
              {hasUltrasound && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-main font-sans">
                      <FileText className="w-5 h-5 text-primary" />
                      Sonographer Ultrasound Reports
                    </h3>
                    <div className="px-3 py-1 rounded-full bg-black/10 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-muted">
                      Ultrasound Worksheets
                    </div>
                  </div>

                  {getSonographerWorksheetsList().length > 0 ? (
                    <div className="space-y-4">
                      {getSonographerWorksheetsList().map((ws) => {
                        const attachedPdfs = getAttachedPdfs(ws);
                        const hasEditedText = isWorkstationTextEdited(ws);

                        // If workstation generator was NOT edited (no text entered into input fields), but PDF is attached: ONLY show attached PDFs as separate files
                        if (!hasEditedText && attachedPdfs.length > 0) {
                          return attachedPdfs.map((pdfFile, pdfIdx) => (
                            <motion.div
                              key={`${ws.id}_pdf_${pdfIdx}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="group glass-panel p-6 hover:border-primary/50 transition-all cursor-pointer shadow-none"
                              onClick={() => openWorksheetViewer({ ...ws, procedureName: pdfFile.name || ws.procedureName, isAttachedPdf: true, pdfFile })}
                            >
                              <div className="flex flex-col md:flex-row gap-6">
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                  <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary group-hover:scale-110 transition-transform" />
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-lg font-bold text-main leading-tight">
                                          {pdfFile.name || ws.procedureName || 'Attached Ultrasound Report'}
                                        </h4>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                          <FileText className="w-3 h-3" />
                                          Attached PDF File
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs font-bold text-muted mt-1 font-mono">
                                        <User className="w-3 h-3 text-primary" />
                                        <span>{ws.sonographerName || 'Sonographer'}</span>
                                        <span className="text-[8px] opacity-30">•</span>
                                        <span>{ws.procedureName || 'Ultrasound Exam'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <p className="text-sm text-main/70 italic leading-relaxed">
                                    Attached sonographer ultrasound document.
                                  </p>

                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openWorksheetViewer({ ...ws, procedureName: pdfFile.name || ws.procedureName, isAttachedPdf: true, pdfFile }); }}
                                      className="px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-lg shadow-primary/20"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View Worksheet PDF
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDownloadPdfFile(pdfFile, pdfFile.name || ws.procedureName); }}
                                      className="px-4 py-2 rounded-xl bg-black/10 dark:bg-white/5 text-muted text-xs font-bold flex items-center gap-2 hover:bg-black/20 dark:hover:bg-white/10 transition-colors"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      Get PDF
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ));
                        }

                        // Workstation text WAS edited -> Render auto-generated worksheet card AND separate attached PDFs
                        return (
                          <React.Fragment key={ws.id}>
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="group glass-panel p-6 hover:border-primary/50 transition-all cursor-pointer shadow-none"
                              onClick={() => openWorksheetViewer(ws)}
                            >
                              <div className="flex flex-col md:flex-row gap-6">
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                  <FileText className="w-6 h-6 md:w-8 md:h-8 text-primary group-hover:scale-110 transition-transform" />
                                </div>
                                
                                <div className="flex-1 space-y-4">
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-lg font-bold text-main leading-tight">
                                          {ws.procedureName || 'Sonogram Worksheet'}
                                        </h4>
                                        {attachedPdfs.length > 0 && (
                                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {attachedPdfs.length} Attached PDF(s)
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-xs font-bold text-muted mt-1 font-mono">
                                        <User className="w-3 h-3 text-primary" />
                                        <span>{ws.sonographerName || 'Sonographer'}</span>
                                        <span className="text-[8px] opacity-30">•</span>
                                        <span>Ultrasound Scan observations</span>
                                      </div>
                                    </div>
                                  </div>

                                  {ws.impression && (
                                    <p className="text-sm text-main/70 line-clamp-2 italic leading-relaxed">
                                      <strong>Impression:</strong> {stripHtml(ws.impression)}
                                    </p>
                                  )}

                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openWorksheetViewer(ws); }}
                                      className="px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-lg shadow-primary/20"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View Worksheet
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDownloadWorksheet(ws); }}
                                      disabled={downloading === `ws_${ws.id}`}
                                      className="px-4 py-2 rounded-xl bg-black/10 dark:bg-white/5 text-muted text-xs font-bold flex items-center gap-2 hover:bg-black/20 dark:hover:bg-white/10 transition-colors"
                                    >
                                      {downloading === `ws_${ws.id}` ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Download className="w-3.5 h-3.5" />
                                      )}
                                      Get PDF
                                    </button>
                                  </div>

                                  {/* Render Attached PDFs as Separate File Items */}
                                  {attachedPdfs.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-white/10 space-y-2" onClick={(e) => e.stopPropagation()}>
                                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5" />
                                        Attached PDF File(s) ({attachedPdfs.length})
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {attachedPdfs.map((pdfFile, pdfIdx) => (
                                          <div 
                                            key={pdfIdx}
                                            className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-medium hover:bg-primary/20 transition-colors"
                                          >
                                            <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                                              <FileText className="w-4 h-4 text-primary shrink-0" />
                                              <span className="truncate font-bold text-main">{pdfFile.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                onClick={() => openWorksheetViewer({ ...ws, procedureName: pdfFile.name || ws.procedureName, isAttachedPdf: true, pdfFile })}
                                                className="px-2.5 py-1.5 rounded-lg bg-primary text-black text-[11px] font-bold flex items-center gap-1 hover:bg-primary/80 transition-colors"
                                              >
                                                <Eye className="w-3 h-3" />
                                                View
                                              </button>
                                              <button
                                                onClick={() => handleDownloadPdfFile(pdfFile, pdfFile.name || ws.procedureName)}
                                                className="p-1.5 rounded-lg bg-black/20 dark:bg-white/10 text-main hover:bg-black/30 transition-colors"
                                                title="Download PDF"
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="glass-panel p-12 border-dashed border-white/20 text-center space-y-4 shadow-none">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto opacity-50">
                        <FileText className="w-8 h-8 text-muted" />
                      </div>
                      <div>
                        <p className="text-main font-bold">Worksheet Prep in Progress</p>
                        <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed mt-1">
                          Our clinical sonographers are working on compiling your ultrasound worksheets. This page will auto-update once submitted.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Imaging Studies */}
              {!isStrictlyUltrasound && (
                <section className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg font-bold flex items-center gap-2 text-main">
                        <ImageIcon className="w-5 h-5 text-primary" />
                        {isStrictlyUltrasound ? "Ultrasound Scan Images" : "Imaging Reference"}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black tracking-wider text-muted uppercase">
                        {images.length} {isStrictlyUltrasound ? "Slices" : "Plates"}
                      </span>
                    </div>

                    <button 
                      onClick={() => {
                        if (isDocVerified) {
                          loadPhysicianViewer();
                        } else {
                          setShowPhysicianAuthModal(true);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 border rounded-xl font-bold text-xs cursor-pointer select-none transition-all active:scale-95 shadow-md shadow-primary/5",
                        isDocVerified 
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 border-solid" 
                          : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 border-solid"
                      )}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isDocVerified ? "Interactive DICOM Viewport (Unlocked)" : "View as Requesting Physician"}</span>
                    </button>
                  </div>

                  {images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {images.map((img, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          key={img.id}
                          onClick={() => setSelectedImageIndex(idx)}
                          className="group relative aspect-square bg-white/10 rounded-2xl overflow-hidden cursor-pointer shadow-sm border border-white/10"
                        >
                          <img 
                            src={img.url} 
                            alt={img.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <p className="text-[10px] font-bold text-white truncate">{img.name || `Plate ${idx + 1}`}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Maximize2 className="w-3 h-3 text-primary" />
                              <span className="text-[8px] text-white/70 font-bold uppercase tracking-widest">{isStrictlyUltrasound ? "View Scan" : "Enlarge View"}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="glass-panel p-12 border-dashed border-white/20 text-center shadow-none">
                      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-xs text-muted font-bold uppercase tracking-widest">
                        {isStrictlyUltrasound ? "Awaiting Ultrasound Scan Data..." : "Awaiting Imaging Data..."}
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </main>

        {/* Modal Overlay / PDF Viewer / Print Fallbacks */}
        <AnimatePresence>
          {viewingReport && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-8"
              onClick={closeReportViewer}
            >
              {/* Dynamic CSS Print Stylesheet injected to override site layout only when printing */}
              <style>{`
                @media print {
                  /* Hide normal screen viewport completely */
                  body, html, #root, .glass-panel, .fixed, .absolute, button, header, nav, footer, .modal-backdrop, [role="dialog"] {
                    background: none !important;
                    color: black !important;
                    box-shadow: none !important;
                    text-shadow: none !important;
                    filter: none !important;
                  }
                  
                  body * {
                    visibility: hidden !important;
                    height: 0 !important;
                    overflow: hidden !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  
                  /* Reveal only our dedicated print layout */
                  #print-report-container, #print-report-container * {
                    visibility: visible !important;
                    height: auto !important;
                    overflow: visible !important;
                  }
                  
                  #print-report-container {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 40px !important;
                    background: white !important;
                    color: black !important;
                    font-family: serif !important;
                    font-size: 11pt !important;
                    line-height: 1.5 !important;
                  }
                  
                  .print-hidden {
                    display: none !important;
                  }
                }
              `}</style>

              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="bg-white text-slate-900 w-full max-w-5xl h-full max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-4 md:p-6 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-black" />
                    </div>
                    <div className="min-w-0 text-slate-900">
                      <h3 className="text-sm md:text-lg font-bold truncate pr-4 text-slate-900">{viewingReport.procedureName}</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Clinical Document Reference</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button 
                      onClick={() => handleDownloadReport(viewingReport)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold hover:bg-primary/80 transition-colors shadow-lg shadow-primary/10"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PDF
                    </button>
                    <button 
                      onClick={closeReportViewer}
                      className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-8 flex flex-col">
                  {/* Original PDF Embed (Highly functional inside desktop browsers) */}
                  <div className="flex-1 w-full relative min-h-[50vh] md:min-h-[65vh] flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {reportPdfUrl ? (
                      <object 
                        data={`${reportPdfUrl}#toolbar=1&view=FitH`} 
                        type="application/pdf"
                        className="w-full h-full bg-white flex-1 min-h-[50vh]"
                      >
                        {/* Inside iframe/sandbox mobile fallback */}
                        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center space-y-6 bg-white text-slate-900">
                          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                            <FileText className="w-10 h-10 text-primary" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-900">Original Document PDF</h3>
                            <p className="text-xs text-slate-600 max-w-sm mx-auto">
                              Your device is ready to save or print this official report PDF.
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center">
                            <button 
                              onClick={() => handleDownloadReport(viewingReport)}
                              className="px-6 py-4 rounded-xl bg-primary text-black font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-primary/80 transition-colors w-full"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF Direct
                            </button>
                          </div>
                        </div>
                      </object>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 py-24 my-auto bg-white text-slate-900">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Compiling PDF Document...</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Mobile Actions */}
                <div className="p-4 sm:hidden bg-white border-t border-slate-200 space-y-2">
                  <button 
                    onClick={() => handleDownloadReport(viewingReport)}
                    className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <p className="text-[9px] text-center text-slate-400 font-sans tracking-wide pt-1">
                    Note: Tap &quot;Download PDF&quot; to securely get the document file.
                  </p>
                </div>
              </motion.div>

              {/* Dedicated Silent Container specifically compiled to be visible ONLY during print sessions */}
              <div id="print-report-container" className="hidden print:block bg-white text-black p-12 hover:bg-white">
                <div className="border-b-2 border-black pb-4 mb-6 flex items-center justify-between">
                  <div>
                    {facilityInfo.letterhead || viewingReport.facilityLetterhead ? (
                      <img 
                        src={facilityInfo.letterhead || viewingReport.facilityLetterhead} 
                        alt="Facility Letterhead" 
                        className="max-h-16 max-w-[280px] object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <h1 className="text-xl font-black text-black">{facilityInfo.name || viewingReport.facilityName || 'DIAGNOSTIC IMAGING CENTER'}</h1>
                    )}
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1">Official Diagnostic Report</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-black uppercase tracking-widest">Diagnostic Record</p>
                    <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider mt-0.5">Secure Electronic Access</p>
                  </div>
                </div>

                <div className="text-center my-6">
                  <h2 className="text-base font-black tracking-wider text-black border-y py-2 uppercase">Clinical Report Findings</h2>
                </div>

                <table className="w-full text-left text-xs mb-8 border border-gray-300 rounded" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr className="border-b border-gray-300">
                      <td className="p-3 font-bold bg-gray-50 uppercase w-1/4">Patient Name:</td>
                      <td className="p-3 w-1/4">{patient?.name}</td>
                      <td className="p-3 font-bold bg-gray-50 uppercase w-1/4">Accession No:</td>
                      <td className="p-3 w-1/4 font-mono">{request?.id}</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="p-3 font-bold bg-gray-50 uppercase">Patient ID / MRN:</td>
                      <td className="p-3 font-mono">{patient?.id}</td>
                      <td className="p-3 font-bold bg-gray-50 uppercase">Study Date:</td>
                      <td>
                        {request?.createdAt ? (
                          typeof request.createdAt === 'object' && 'seconds' in request.createdAt
                            ? new Date(request.createdAt.seconds * 1000).toLocaleDateString()
                            : new Date(request.createdAt as any).toLocaleDateString()
                        ) : 'N/A'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="p-3 font-bold bg-gray-50 uppercase">Age / Gender:</td>
                      <td>{patient?.age || 'N/A'} / {patient?.gender || 'N/A'}</td>
                      <td className="p-3 font-bold bg-gray-50 uppercase">Report Date:</td>
                      <td>
                        {viewingReport.createdAt ? (
                          typeof viewingReport.createdAt === 'object' && 'seconds' in viewingReport.createdAt
                            ? new Date(viewingReport.createdAt.seconds * 1000).toLocaleDateString()
                            : new Date(viewingReport.createdAt as any).toLocaleDateString()
                        ) : new Date().toLocaleDateString()}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="p-3 font-bold bg-gray-50 uppercase">Procedure:</td>
                      <td colSpan={3} className="font-bold text-gray-900">{viewingReport.procedureName}</td>
                    </tr>
                    {request?.physicianName && (
                      <tr>
                        <td className="p-3 font-bold bg-gray-50 uppercase">Referring Physician:</td>
                        <td colSpan={3}>{request.physicianName}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="space-y-6 text-sm">
                  {viewingReport.clinicalHistory && (
                    <div className="space-y-1">
                      <h3 className="font-bold text-xs uppercase tracking-wider text-black border-b pb-1">Clinical History</h3>
                      <p className="leading-relaxed italic text-gray-700 pl-3 border-l-2 border-gray-300">{viewingReport.clinicalHistory}</p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-black border-b pb-1">Findings</h3>
                    <div 
                      className="prose prose-sm leading-relaxed text-black space-y-2
                        [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_br]:block"
                      dangerouslySetInnerHTML={{ __html: viewingReport.findings || '' }}
                    />
                  </div>

                  <div className="space-y-1 pt-2">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-black border-b pb-1">Impression</h3>
                    <div 
                      className="prose prose-sm leading-relaxed text-black space-y-2 font-bold
                        [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_br]:block"
                      dangerouslySetInnerHTML={{ __html: viewingReport.impression || '' }}
                    />
                  </div>
                </div>

                <div className="mt-12 pt-6 border-t border-dashed border-gray-400 flex justify-between items-end text-xs text-gray-500">
                  <div className="max-w-xs">
                    <p className="font-bold text-gray-700 uppercase tracking-wider mb-1">Security Verified Record</p>
                    <p>This official diagnostic imaging record is electronically signed and authorized. The digital signature preserves verified patient outcomes.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-black text-sm">{viewingReport.radiologistName || 'Interpreting Specialist'}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">Consultant Radiologist</p>
                    <p className="text-[9px] mt-1 text-emerald-800 font-bold uppercase">✓ Secure Electronic Signature</p>
                  </div>
                </div>
              </div>

            </motion.div>
          )}

          {viewingWorksheet && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8"
              onClick={closeWorksheetViewer}
            >
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="bg-white text-slate-900 w-full max-w-5xl h-full max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-4 md:p-6 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
                      <FileText className="w-5 h-5 text-black" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm md:text-lg font-bold text-slate-900 truncate pr-4">{viewingWorksheet.procedureName}</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Sonographer Ultrasound Report / Worksheet</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button 
                      onClick={() => handleDownloadWorksheet(viewingWorksheet)}
                      disabled={downloading === `ws_${viewingWorksheet.id}`}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold hover:bg-primary/80 transition-colors shadow-lg shadow-primary/10"
                    >
                      {downloading === `ws_${viewingWorksheet.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Download PDF
                    </button>
                    <button 
                      onClick={closeWorksheetViewer}
                      className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-8 flex flex-col">
                  <div className="flex-1 w-full relative min-h-[50vh] md:min-h-[65vh] flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-inner">
                    {worksheetPdfUrl ? (
                      <object 
                        data={`${worksheetPdfUrl}#toolbar=1&view=FitH`} 
                        type="application/pdf"
                        className="w-full h-full bg-white flex-1 min-h-[50vh] md:min-h-[65vh]"
                      >
                        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center space-y-6 bg-white text-slate-900">
                          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                            <FileText className="w-10 h-10 text-primary" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-950">Ultrasound Worksheet PDF Ready</h3>
                            <p className="text-xs text-slate-600 max-w-sm mx-auto">
                              Your device is ready to save or print this sonographer worksheet PDF.
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center">
                            <button 
                              onClick={() => handleDownloadWorksheet(viewingWorksheet)}
                              className="px-6 py-4 rounded-xl bg-primary text-black font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-primary/80 transition-colors w-full"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF Direct
                            </button>
                          </div>
                        </div>
                      </object>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-4 py-24 my-auto mx-auto text-center bg-white text-slate-900">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Compiling PDF Document...</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Mobile Actions */}
                <div className="p-4 sm:hidden bg-white border-t border-slate-200 space-y-2">
                  <button 
                    onClick={() => handleDownloadWorksheet(viewingWorksheet)}
                    className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Full View Modal */}
        <AnimatePresence>
          {selectedImageIndex !== null && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4"
              onClick={() => setSelectedImageIndex(null)}
            >
              <button 
                onClick={() => setSelectedImageIndex(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="relative w-full max-w-5xl h-full flex flex-col items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                  <motion.img 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    src={images[selectedImageIndex].url}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  />
                </div>
                
                <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4 max-w-2xl px-4 pb-6">
                  <div className="text-center md:text-left">
                    <p className="text-xs font-black uppercase text-primary tracking-widest mb-1">{images[selectedImageIndex].name || 'Diagnostic Reference'}</p>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">High-Resolution Plate {selectedImageIndex + 1} / {images.length}</p>
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide mt-1 block md:hidden">
                      Note: Tap and hold image to save to Photos
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex bg-white/5 rounded-2xl border border-white/10 p-1">
                      <button 
                        onClick={() => setSelectedImageIndex(Math.max(0, selectedImageIndex - 1))}
                        disabled={selectedImageIndex === 0}
                        className="p-3 text-white disabled:opacity-30 hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                      </button>
                      <button 
                        onClick={() => setSelectedImageIndex(Math.min(images.length - 1, selectedImageIndex + 1))}
                        disabled={selectedImageIndex === images.length - 1}
                        className="p-3 text-white disabled:opacity-30 hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                    <button 
                      onClick={() => handleDownloadImage(images[selectedImageIndex].url, images[selectedImageIndex].name)}
                      className="px-6 py-4 rounded-2xl bg-primary text-black text-xs font-bold flex items-center gap-2 hover:bg-primary/80 transition-colors shadow-xl shadow-primary/30"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Referring Practitioner Authentication Disclaimer Dialog */}
        <AnimatePresence>
          {showPhysicianAuthModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans text-white"
              onClick={() => setShowPhysicianAuthModal(false)}
            >
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase text-cyan-400 tracking-wider">Clinician Hub Link</h4>
                      <p className="text-[10px] text-teal-300 font-black uppercase tracking-wider">Quick Sign-In & Diagnostics Preference</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowPhysicianAuthModal(false)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handlePhysicianVerifySubmit} className="space-y-4">
                  <p className="text-xs text-slate-100 font-medium leading-relaxed">
                    This interactive viewport is reserved for medical clinicians managing {patient?.name || 'Sister Zeinab'}. Please input your details to unlock.
                  </p>

                  <div className="space-y-3.5">
                    {/* Practitioner Name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-200 tracking-wider block">Your Name</label>
                      <input 
                        type="text"
                        value={physicianVerifyName}
                        onChange={e => {
                          setPhysicianVerifyName(e.target.value);
                          setPhysicianVerifyError('');
                        }}
                        placeholder="e.g. Dr. Kwabena Boateng"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/25 text-white font-bold placeholder:text-slate-400/60 text-xs focus:border-primary outline-none transition-colors"
                        required
                      />
                    </div>

                    {/* Facility */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-200 tracking-wider block">Facility / Practice</label>
                      <input 
                        type="text"
                        value={physicianFacility}
                        onChange={e => {
                          setPhysicianFacility(e.target.value);
                          setPhysicianVerifyError('');
                        }}
                        placeholder="King's Diagnostic Imaging and Research Center"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/25 text-white font-bold placeholder:text-slate-400/60 text-xs focus:border-primary outline-none transition-colors"
                        required
                      />
                    </div>

                    {/* Gmail Address */}
                    <div className="space-y-1.5 border-t border-white/5 pt-3.5">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-black uppercase text-emerald-300 tracking-wider block">Referring Doctor's Gmail Address</label>
                      </div>
                      <input 
                        type="email"
                        value={physicianGmail}
                        onChange={e => {
                          setPhysicianGmail(e.target.value);
                          setPhysicianVerifyError('');
                        }}
                        placeholder="e.g. physician.boateng@gmail.com"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-emerald-400/30 text-white font-bold placeholder:text-slate-400/60 text-xs focus:border-emerald-400 outline-none transition-colors"
                        required
                      />
                      <p className="text-[10px] text-emerald-300 font-semibold italic">
                        💡 Your Gmail is securely captured to configure single-click clinical synchronization.
                      </p>
                    </div>
                  </div>

                  {physicianVerifyError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-red-400 text-xs font-bold leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <p>{physicianVerifyError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSurveySubmitting}
                    className="w-full py-3.5 rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/10 hover:shadow-primary/25 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSurveySubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Unlock & Load Viewer
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fullscreen Interactive DICOM Viewer */}
        <AnimatePresence>
          {isDicomViewerOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] bg-[#020202] text-white flex flex-col font-sans overflow-hidden dicom-viewer-dark-scope patient-portal-viewer"
            >
              {/* Unified Header & Toolbar Control Panel: Always static, in-flow, and beautifully optimized */}
              <div className="w-full bg-[#0c0c0c]/95 backdrop-blur-md z-[140] flex flex-col border-b border-white/15 relative shrink-0">
                {/* Top Control Bar with optimized compact height */}
                <div className="h-14 bg-white/[0.04] px-3 sm:px-4 md:px-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 hidden md:flex">
                      <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 leading-none">
                        <span className="text-xs sm:text-sm font-black uppercase text-white tracking-wide truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{patient?.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 tracking-wider uppercase inline-block whitespace-nowrap">Referring Clinician Portal</span>
                      </div>
                      <p className="text-[9px] sm:text-[10px] text-slate-300 font-bold uppercase tracking-wider truncate mt-0.5 leading-none">
                        MRN: <span className="text-white font-black">{mrn}</span> <span className="hidden xs:inline text-slate-400">• Acc: <span className="text-white font-black">{request?.id.slice(0, 8).toUpperCase()}</span></span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                    {/* Layout Selector */}
                    <div className="flex bg-white/10 border border-white/15 rounded-lg p-0.5 shrink-0 select-none">
                      <button 
                        onClick={() => {
                          setDicomViewLayout('1x1');
                          useViewerStore.getState().setLayout('1x1');
                        }}
                        className={cn(
                          "px-1.5 sm:px-2.5 py-1 rounded-md text-[9px] sm:text-xs font-bold uppercase transition-all flex items-center gap-1 cursor-pointer select-none",
                          dicomViewLayout === '1x1' ? "bg-primary text-black font-semibold shadow-md" : "text-slate-300 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <span>1x1</span>
                      </button>
                      <button 
                        onClick={() => {
                          setDicomViewLayout('2x2');
                          useViewerStore.getState().setLayout('2x2');
                          // Fill all quadrants
                          const imageIds = images.map(img => img.url).filter(Boolean);
                          useViewerStore.getState().setViewportData(0, imageIds);
                          useViewerStore.getState().setViewportData(1, imageIds);
                          useViewerStore.getState().setViewportData(2, imageIds);
                          useViewerStore.getState().setViewportData(3, imageIds);
                        }}
                        className={cn(
                          "px-1.5 sm:px-2.5 py-1 rounded-md text-[9px] sm:text-xs font-bold uppercase transition-all flex items-center gap-1 cursor-pointer select-none",
                          dicomViewLayout === '2x2' ? "bg-primary text-black font-semibold shadow-md" : "text-slate-300 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <span>2x2</span>
                      </button>
                    </div>

                    {/* High Utility Sidebar Toggle */}
                    <button 
                      onClick={() => setIsDicomSidebarOpen(!isDicomSidebarOpen)}
                      className={cn(
                        "flex items-center gap-1 py-1 px-2.5 sm:px-3 border rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer text-nowrap",
                        isDicomSidebarOpen 
                          ? "bg-primary text-black border-primary" 
                          : "border-white/15 text-slate-200 bg-white/5 hover:bg-white/10"
                      )}
                      title="Toggle Study Info"
                    >
                      <Info className="w-3 h-3 shrink-0" />
                      <span className="hidden xs:inline">Study Info</span>
                    </button>

                    <button 
                      onClick={() => {
                        if (!surveySubmitted && !hasPostponedSurvey) {
                          setShowTimedSurveyPrompt(true);
                        } else {
                          setIsDicomViewerOpen(false);
                        }
                      }}
                      className="flex items-center gap-1 py-1 px-2.5 sm:px-3 bg-red-600/20 hover:bg-red-600/35 border border-red-500/40 rounded-lg text-red-200 hover:text-white text-[9px] sm:text-xs font-bold uppercase tracking-wider transition-all shrink-0 outline-none cursor-pointer text-nowrap shadow-md hover:shadow-red-900/20 active:scale-95"
                    >
                      <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>Close Viewport</span>
                    </button>
                  </div>
                </div>

                {/* Consolidated Medical Toolbar */}
                <div className="px-4 py-2 bg-[#0a0a0a]/95 [.theme-teleradiology_&]:bg-slate-100 border-t border-white/5 [.theme-teleradiology_&]:border-slate-300">
                  <Toolbar />
                </div>
              </div>

              {/* Main Workspace Grid */}
              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden relative">
                {/* Center Viewport Compartment - Optimized Padding and Gap on mobile */}
                <div className="flex-[2] flex flex-col p-1.5 sm:p-2.5 gap-1.5 sm:gap-2.5 relative h-[55vh] md:h-auto min-h-[40vh] md:min-h-0 bg-[#0a0a0a] shrink-0 md:shrink">

                  {/* Rendering Grid */}
                  <div className={cn(
                    "flex-1 grid gap-1.5 sm:gap-2 overflow-hidden min-h-0 rounded-xl sm:rounded-2xl bg-black border border-white/5 shadow-inner relative",
                    dicomViewLayout === '1x1' ? "grid-cols-1 grid-rows-1" : "grid-cols-2 grid-rows-2"
                  )}>
                    {dicomViewLayout === '1x1' ? (
                      <Viewport index={0} imageIds={images.map(img => img.url).filter(Boolean)} />
                    ) : (
                      <>
                        <Viewport index={0} imageIds={images.map(img => img.url).filter(Boolean)} />
                        <Viewport index={1} imageIds={images.map(img => img.url).filter(Boolean)} />
                        <Viewport index={2} imageIds={images.map(img => img.url).filter(Boolean)} />
                        <Viewport index={3} imageIds={images.map(img => img.url).filter(Boolean)} />
                      </>
                    )}
                  </div>
                </div>

                {/* Right Panel Compartment (Width: 320px) - Toggleable & Responsive matching Radiologist's layout */}
                {isDicomSidebarOpen && (
                  <div className="w-full md:w-[320px] bg-white/[0.04] border-t md:border-t-0 md:border-l border-white/15 flex flex-col h-[55vh] md:h-auto overflow-hidden shrink-0 md:shrink-none md:flex-none">
                    {/* Right Header */}
                    <div className="h-12 border-b border-white/15 bg-white/[0.02] flex shrink-0 items-center px-4 select-none">
                      <div className="flex items-center gap-2 text-primary">
                        <Info className="w-4 h-4 shrink-0" />
                        <span className="font-black text-[10px] tracking-widest uppercase text-white">Study Metadata</span>
                      </div>
                    </div>

                    {/* Tab Body */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-slate-950/40">
                      <MetadataPanel />
                    </div>

                    {/* Hidden Old Survey Elements */}
                    <div className="hidden">
                      {!surveySubmitted ? (
                        <div className="h-full flex flex-col">
                          <div className="flex-1">
                            <MetadataPanel />
                          </div>
                          
                          {/* Prompt they have a pending preference survey */}
                          <div className="mt-4 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col gap-3">
                            <div className="flex items-start gap-2 text-primary">
                              <Vote className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] uppercase font-black tracking-wider text-primary">Practice Study Invitation</p>
                                <p className="text-[11px] text-white/90 leading-relaxed mt-1 font-semibold">
                                  We are evaluating practitioner preferences between this digital system and physical films. Please help by submitting a 1-minute survey response!
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setSurveySubmitted(true)} 
                              className="w-full py-2.5 bg-primary text-black font-black uppercase text-[10px] tracking-wider rounded-xl shadow-md hover:bg-primary/90 transition-colors cursor-pointer"
                            >
                              Fill Quick Preference Study
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-primary">
                            <Vote className="w-4 h-4 shrink-0" />
                            <h4 className="text-xs font-black uppercase tracking-wider text-primary">Practitioner Preference Study</h4>
                          </div>
                          <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
                            Your input helps our department gauge professional workflow choices between digital pixel interactive manipulation and physical prints / CDs.
                          </p>

                          {surveySubmitted && surveyPreference ? (
                            <motion.div 
                              initial={{ scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-4"
                            >
                              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                                <Check className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="text-xs font-black uppercase tracking-wider text-white">Preference Log Secured</p>
                                
                                <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-left">
                                  <div className="text-[11px] leading-relaxed">
                                    <span className="text-slate-400">Practitioner:</span> <span className="font-extrabold text-white">{sessionStorage.getItem('physician_name') || 'Dr. Practitioner'}</span>
                                  </div>
                                  <div className="text-[11px] leading-relaxed">
                                    <span className="text-slate-400">Facility:</span> <span className="font-bold text-white">{sessionStorage.getItem('physician_facility') || 'Practice Office'}</span>
                                  </div>
                                  <div className="text-[11px] leading-relaxed">
                                    <span className="text-slate-400">Modality Pref:</span> <span className={cn(
                                      "font-black uppercase text-[9px] px-1.5 py-0.5 rounded",
                                      surveyPreference === 'portal' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                                    )}>{surveyPreference === 'portal' ? 'Digital Portal' : 'Conventional Film'}</span>
                                  </div>
                                  {sessionStorage.getItem('physician_gmail') && (
                                    <div className="text-[11px] leading-relaxed border-t border-white/10 pt-1.5 mt-1.5">
                                      <span className="text-slate-400">Synced Gmail:</span> <span className="font-bold text-emerald-400 font-mono text-[10px] block truncate">{sessionStorage.getItem('physician_gmail')}</span>
                                    </div>
                                  )}
                                </div>

                                <p className="text-[10px] text-slate-300 font-medium leading-relaxed mt-3">
                                  Your diagnostics preference is synchronized directly with the facility administration team.
                                </p>
                              </div>
                              <button 
                                onClick={() => {
                                  setSurveySubmitted(false);
                                  setSurveyPreference('');
                                  setSurveyRecommendation(null);
                                  setSurveyNotes('');
                                }}
                                className="px-4 py-2 bg-white/10 border border-white/15 rounded-xl text-[9px] font-bold text-white tracking-wide hover:bg-white/20 uppercase cursor-pointer"
                              >
                                Reset and Fill again
                              </button>
                            </motion.div>
                          ) : (
                            <form onSubmit={handleSurveySubmit} className="space-y-5">
                              {/* Preference selection */}
                              <div className="space-y-2.5">
                                <label className="text-[10px] font-black uppercase text-primary tracking-wider block">1. Form Factor Preference</label>
                                <div className="space-y-2">
                                  {[
                                    { value: 'portal', label: 'Raw digital web portal (this tool)', desc: 'Preferred due to active measurements, brightness scaling, and instant access' },
                                    { value: 'film', label: 'Conventional physical film prints/CDs', desc: 'Preferred for physical hand-off or traditional workspace mounts' },
                                    { value: 'both', label: 'Hybrid / depends on diagnostic complexity', desc: 'No strong preference; both forms are utilized interchangeably' }
                                  ].map(opt => (
                                    <label 
                                      key={opt.value}
                                      onClick={() => setSurveyPreference(opt.value)}
                                      className={cn(
                                        "p-3 rounded-xl border block cursor-pointer transition-all hover:bg-white/10",
                                        surveyPreference === opt.value 
                                          ? "bg-primary/5 border-primary text-primary" 
                                          : "bg-white/[0.02] border-white/10 text-slate-300 hover:text-white"
                                      )}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className={cn(
                                          "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
                                          surveyPreference === opt.value ? "border-primary" : "border-slate-500"
                                        )}>
                                          {surveyPreference === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                                        </div>
                                        <span className="text-xs font-bold leading-tight">{opt.label}</span>
                                      </div>
                                      <p className="text-[9px] text-slate-400 font-medium mt-1 leading-normal pl-[22px]">{opt.desc}</p>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              {/* Recommendation rating */}
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-primary tracking-wider block">2. Recommendation Rating</label>
                                <p className="text-[9px] text-slate-300 font-medium leading-relaxed">
                                  How likely are you to recommend pixel-rendering web viewports over printed sheets? (10 is highly likely)
                                </p>
                                <div className="grid grid-cols-10 gap-1 mt-1">
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                    <button
                                      type="button"
                                      key={num}
                                      onClick={() => setSurveyRecommendation(num)}
                                      className={cn(
                                        "aspect-square rounded-lg flex items-center justify-center text-[10px] font-black select-none border transition-all cursor-pointer",
                                        surveyRecommendation === num 
                                          ? "bg-primary text-black border-primary scale-115"
                                          : "bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:border-white/20 hover:scale-105"
                                      )}
                                    >
                                      {num}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Optional comments */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-primary tracking-wider block">3. Usability Improvement Comments</label>
                                <textarea 
                                  value={surveyNotes}
                                  onChange={e => setSurveyNotes(e.target.value)}
                                  placeholder="E.g., measurements tool accuracy, scaling latency, load time feedback..."
                                  className="w-full h-20 p-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium placeholder:text-slate-400 text-xs focus:border-primary outline-none transition-colors resize-none"
                                />
                              </div>

                              <button 
                                type="submit"
                                disabled={isSurveySubmitting || !surveyPreference || surveyRecommendation === null}
                                className="w-full py-3.5 bg-primary rounded-xl text-black font-black uppercase tracking-wider text-xs shadow-lg shadow-primary/10 hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                {isSurveySubmitting ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Logging Response...</span>
                                  </>
                                ) : (
                                  <>
                                    <Vote className="w-4 h-4" />
                                    <span>Submit Study Survey</span>
                                  </>
                                )}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* TIMED SURVEY PROMPT OVERLAY */}
              <AnimatePresence>
                {showTimedSurveyPrompt && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 20 }}
                      className="max-w-sm w-full bg-[#121212] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4"
                    >
                      <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <Vote className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-primary">Quick Practitioner Survey</h4>
                          <p className="text-[9px] text-muted uppercase tracking-wider mt-0.5">Help us improve clinical tools</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed font-semibold">
                        Please share your quick diagnostic viewing preferences:
                      </p>

                      <form onSubmit={handleSurveySubmit} className="space-y-4">
                        {/* 1. Format Preference */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-primary tracking-wider block">1. Preferred Format</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: 'portal', label: 'Digital Web Portal' },
                              { value: 'film', label: 'Conventional Film/CD' }
                            ].map(opt => (
                              <button 
                                type="button"
                                key={opt.value}
                                onClick={() => setSurveyPreference(opt.value)}
                                className={cn(
                                  "py-2 px-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-extrabold block",
                                  surveyPreference === opt.value 
                                    ? "bg-primary text-black border-primary font-bold" 
                                    : "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5 hover:text-white"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 2. Recommendation (1-10) */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-primary tracking-wider block">2. Recommendation Rating (1 - 10)</label>
                          <div className="grid grid-cols-10 gap-0.5">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                              <button
                                type="button"
                                key={num}
                                onClick={() => setSurveyRecommendation(num)}
                                className={cn(
                                  "aspect-square rounded-lg flex items-center justify-center text-[10px] font-black border transition-all cursor-pointer",
                                  surveyRecommendation === num 
                                    ? "bg-primary text-black border-primary scale-110"
                                    : "bg-white/[0.04] border-white/10 text-slate-300 hover:text-white"
                                )}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 3. Comments (Optional) */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-primary tracking-wider block">3. Quick Feedback (Optional)</label>
                          <input 
                            type="text"
                            value={surveyNotes}
                            onChange={e => setSurveyNotes(e.target.value)}
                            placeholder="e.g. latency, image tools, load speed..."
                            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white font-medium placeholder:text-slate-600 text-xs focus:border-primary outline-none transition-colors"
                          />
                        </div>

                        <div className="flex gap-2 pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setHasPostponedSurvey(true);
                              setShowTimedSurveyPrompt(false);
                            }}
                            className="flex-1 py-2.5 border border-white/10 hover:bg-white/5 rounded-xl text-white font-black uppercase tracking-wider text-[9px] cursor-pointer transition-colors"
                          >
                            Ask Me Later
                          </button>
                          
                          <button 
                            type="submit"
                            disabled={isSurveySubmitting || !surveyPreference || surveyRecommendation === null}
                            className="flex-1 py-2.5 bg-primary rounded-xl text-black font-black uppercase tracking-wider text-[9px] shadow-lg hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {isSurveySubmitting ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Submitting...</span>
                              </>
                            ) : (
                              <>
                                <Vote className="w-3.5 h-3.5" />
                                <span>Submit Survey</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // LOGIN VIEW
  return (
    <div className={cn(
      "min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 transition-all duration-700 overflow-hidden relative font-sans",
      theme === 'cyber' && "bg-[#020202] text-white"
    )}>
      {/* Background Decor - Dynamic based on theme */}
      <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000">
        {theme === 'cyber' ? (
          <>
            <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100" />
          </>
        ) : (
          <>
            <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-100 rounded-full blur-[140px]" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-50 rounded-full blur-[140px]" />
          </>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="text-center mb-12 space-y-6">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-block relative"
          >
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-110 group-hover:scale-125 transition-transform duration-500 opacity-50" />
              <img 
                src={facilityInfo.logo || "/logo.png"} 
                alt={facilityInfo.name || "Facility Logo"} 
                className="h-24 md:h-32 w-auto object-contain relative z-10 drop-shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
          
          <div className="space-y-2">
            <h1 className={cn(
              "text-3xl md:text-4xl font-black tracking-tight uppercase italic",
              theme === 'cyber' ? "text-white" : "text-slate-900"
            )}>
              {facilityInfo.name || 'Patient Portal'}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <div className="h-[1px] w-8 bg-primary/40" />
              <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em]">Secure Results Access</p>
              <div className="h-[1px] w-8 bg-primary/40" />
            </div>
          </div>
        </div>

        <div className={cn(
          "relative group transition-all duration-500",
          theme === 'cyber' 
            ? "bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-[2.5rem] p-1 shadow-2xl" 
            : "bg-white border border-slate-200 rounded-[2.5rem] p-1 shadow-xl shadow-slate-200/50"
        )}>
          {/* Inner glass layer for cyber */}
          <div className={cn(
            "rounded-[2.4rem] p-8 md:p-10",
            theme === 'cyber' && "bg-gradient-to-br from-white/[0.02] to-transparent"
          )}>
            <form onSubmit={handleLogin} className="space-y-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest pl-1 opacity-80">Reference ID (MRN)</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                      value={mrn}
                      onChange={e => setMrn(e.target.value)}
                      className={cn(
                        "w-full pl-14 pr-5 h-16 rounded-3xl transition-all outline-none font-bold tracking-[0.1em] text-sm uppercase placeholder:text-muted/50 border-2 shadow-sm",
                        theme === 'cyber' 
                          ? "bg-white/5 border-white/10 focus:border-primary focus:bg-white/10 text-white" 
                          : "bg-slate-50 border-slate-100 focus:border-primary focus:bg-white text-slate-900"
                      )}
                      placeholder="ENTER YOUR MRN"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest pl-1 opacity-80">Access Key</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                      <LockIcon className="w-4 h-4 text-muted group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                      value={accessCode}
                      onChange={e => setAccessCode(e.target.value)}
                      type="password"
                      maxLength={12}
                      className={cn(
                        "w-full pl-14 pr-5 h-16 rounded-3xl transition-all outline-none text-center tracking-[0.8em] text-xl font-black placeholder:tracking-normal placeholder:font-bold placeholder:text-sm placeholder:text-muted/50 border-2 shadow-sm",
                        theme === 'cyber' 
                          ? "bg-white/5 border-white/10 focus:border-primary focus:bg-white/10 text-white" 
                          : "bg-slate-50 border-slate-100 focus:border-primary focus:bg-white text-slate-900"
                      )}
                      placeholder="••••••"
                      required
                    />
                  </div>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs shadow-inner"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="font-bold flex-1">{error}</p>
                </motion.div>
              )}

              <button 
                type="submit"
                disabled={loading || mrn.length < 3 || accessCode.length < 4}
                className={cn(
                  "w-full h-16 rounded-3xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:transform-none select-none",
                  theme === 'cyber'
                    ? "bg-primary text-black shadow-[0_10px_40px_-5px_rgba(var(--primary-rgb),0.4)] hover:shadow-[0_15px_50px_-5px_rgba(var(--primary-rgb),0.6)] hover:-translate-y-1"
                    : "bg-primary text-black shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="animate-pulse">Authorizing...</span>
                  </>
                ) : (
                  <>
                    Enter Portal
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-12 space-y-6">
          <p className="text-[9px] text-muted font-bold uppercase tracking-widest leading-relaxed max-w-xs mx-auto opacity-60">
            For technical assistance or if you have lost your examination slip, please contact our support desk.
          </p>
          
          <div className="flex items-center justify-center gap-6 pt-4 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-default">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-2">
              <LockIcon size={10} className="text-primary" />
              Encrypted
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
