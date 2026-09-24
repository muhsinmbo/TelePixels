import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, writeBatch, collection, serverTimestamp, onSnapshot, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { supabase, BUCKET_NAME } from '../supabase';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, File, X, CheckCircle, Loader2, ImagePlus, Plus, AlertCircle, Mail, UserCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { logAction } from '../services/loggerService';
import AccessPassModal from '../components/AccessPassModal';
import { useAuth } from '../contexts/AuthContext';
import { ULTRASOUND_PROCEDURES, isXRayOrMammographyProcedure } from '../constants';

export default function StudyUpload() {
  const { patientId, requestId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [radiographerHistory, setRadiographerHistory] = useState('');
  const [needsReport, setNeedsReport] = useState(true);
  const [showAccessPass, setShowAccessPass] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [radiologists, setRadiologists] = useState<any[]>([]);
  const [selectedRadiologist, setSelectedRadiologist] = useState<string>('');
  const [studyModality, setStudyModality] = useState<string>('OT');
  const [procedures, setProcedures] = useState<any[]>([]);
  const [activeProcedureIndex, setActiveProcedureIndex] = useState<number>(0);
  const [procedureFiles, setProcedureFiles] = useState<Record<number, File[]>>({});
  const [procedurePreviews, setProcedurePreviews] = useState<Record<number, string[]>>({});
  const [existingImagesCount, setExistingImagesCount] = useState<Record<string, number>>({});
  const [uploadingForProc, setUploadingForProc] = useState<number | null>(null);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });

  // Fetch Specialist and Global Settings
  React.useEffect(() => {
    const fetchRadiologists = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'radiologist'));
        const snap = await getDocs(q);
        setRadiologists(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error fetching radiologists:', err);
      }
    };

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

    fetchRadiologists();
    return () => unsubscribeGlobal();
  }, []);

  // Fetch request data to know if report is required
  React.useEffect(() => {
    if (!patientId || !requestId) return;
    const requestRef = doc(db, 'patients', patientId, 'requests', requestId);
    const unsubscribe = onSnapshot(requestRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const hasAnyNeedsReportProc = !!(data.procedures && Array.isArray(data.procedures) && data.procedures.some((p: any) => p.needsReport));
        if (data.needsReport !== undefined) {
          setNeedsReport(data.needsReport || hasAnyNeedsReportProc);
        } else {
          setNeedsReport(hasAnyNeedsReportProc);
        }
        if (data.accessCode) {
          setAccessCode(data.accessCode);
        }
        if (data.procedures && Array.isArray(data.procedures)) {
          setProcedures(data.procedures);
        }
        if (data.modalities && data.modalities.length > 0) {
          // Map to standard DICOM modality codes if possible
          const modMap: Record<string, string> = {
            'X-Ray': 'DX',
            'CT Scan': 'CT',
            'MRI': 'MR',
            'Ultrasound': 'US',
            'Mammography': 'MG',
            'Contrast Studies': 'DX'
          };
          const firstMod = data.modalities[0];
          setStudyModality(modMap[firstMod] || firstMod || 'OT');
        }
      }
    });

    // Fetch patient name
    const patientRef = doc(db, 'patients', patientId);
    getDoc(patientRef).then(snap => {
      if (snap.exists()) setPatientName(snap.data().name);
    });

    // Fetch existing images to show counts
    const fetchExistingCounts = async () => {
      try {
        const imagesRef = collection(db, 'patients', patientId, 'requests', requestId, 'images');
        const snap = await getDocs(imagesRef);
        const counts: Record<string, number> = {};
        snap.forEach(doc => {
          const data = doc.data();
          const procId = data.procedureId || 'legacy';
          counts[procId] = (counts[procId] || 0) + 1;
        });
        setExistingImagesCount(counts);
      } catch (err) {
        console.error('Error fetching image counts:', err);
      }
    };
    fetchExistingCounts();

    return unsubscribe;
  }, [patientId, requestId]);

  // Clean up ObjectURLs to prevent memory leaks
  React.useEffect(() => {
    return () => previews.forEach(url => URL.revokeObjectURL(url));
  }, [previews]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      
      setProcedureFiles(prev => ({
        ...prev,
        [activeProcedureIndex]: [...(prev[activeProcedureIndex] || []), ...newFiles]
      }));
      
      const newPreviews = newFiles.map(file => {
        if (file.type.startsWith('image/')) {
          return URL.createObjectURL(file);
        }
        return ''; 
      });

      setProcedurePreviews(prev => ({
        ...prev,
        [activeProcedureIndex]: [...(prev[activeProcedureIndex] || []), ...newPreviews]
      }));

      setError(null);
    }
  };

  const removeFile = (fileIdx: number) => {
    const currentPreviews = procedurePreviews[activeProcedureIndex] || [];
    if (currentPreviews[fileIdx]) URL.revokeObjectURL(currentPreviews[fileIdx]);

    setProcedureFiles(prev => ({
      ...prev,
      [activeProcedureIndex]: prev[activeProcedureIndex].filter((_, i) => i !== fileIdx)
    }));
    
    setProcedurePreviews(prev => ({
      ...prev,
      [activeProcedureIndex]: prev[activeProcedureIndex].filter((_, i) => i !== fileIdx)
    }));
  };

  const handleSingleUpload = async (procIdx: number) => {
    const procedure = procedures[procIdx];
    const procedureName = typeof procedure === 'string' ? procedure : (procedure?.name || procedure?.partName || procedure?.procedureName || 'Unknown');

    if (isSonographer) {
      toast.error('Sonographers are not permitted to upload medical images.');
      return;
    }

    if (isRadiographer && !isXRayOrMammographyProcedure(procedure, studyModality)) {
      toast.error('Radiographers can only upload images for X-Ray and Mammography procedures.');
      return;
    }

    const files = procedureFiles[procIdx];
    if (!files || files.length === 0) return;
    if (!patientId || !requestId) return;

    setUploadingForProc(procIdx);
    setUploading(true);
    setProgress(0);
    setError(null);
    setStatusMessage(`Uploading for ${procedureName}...`);
    
    try {
      const processedImages: any[] = [];
      const totalFiles = files.length;
      let completedCount = 0;
      
      for (const file of files) {
        const safeId = Math.random().toString(36).substring(2, 10);
        const ext = file.name.split('.').pop() || 'bin';
        const storagePath = `${patientId}/${requestId}/${Date.now()}_${safeId}.${ext}`;
        
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storagePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: true
          });
          
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(storagePath);
        
        processedImages.push({
          url: publicUrl,
          storagePath: storagePath,
          name: file.name,
          uploadedAt: serverTimestamp(),
          procedureId: (procedure as any).id || procIdx.toString(),
          procedureName: procedureName,
          accessCode: accessCode, // Replicate for portal access
          laterality: (procedure as any).laterality || 'None',
          dicomHeader: { 
            modality: studyModality, 
            sopInstanceUid: safeId,
            bodyPart: procedureName
          }
        });

        completedCount++;
        setProgress(Math.round((completedCount / totalFiles) * 100));
      }

      const dbBatch = writeBatch(db);
      const imagesRef = collection(db, 'patients', patientId, 'requests', requestId, 'images');
      
      processedImages.forEach(img => {
        const newImgRef = doc(imagesRef);
        dbBatch.set(newImgRef, img);
      });

      const hasUltrasound = (procedures || []).some((p: any) => ULTRASOUND_PROCEDURES.includes(p.name));
      const requestRef = doc(db, 'patients', patientId, 'requests', requestId);
      dbBatch.update(requestRef, {
        status: needsReport ? 'Images Uploaded' : 'Completed', // Partial update of status
        needsReport: needsReport,
        updatedAt: serverTimestamp(),
        radiographerId: profile?.uid,
        radiographerName: profile?.displayName || 'Unknown'
      });
      
      await dbBatch.commit();
      
      logAction({
        action: 'IMAGE_UPLOAD',
        details: `${profile?.role === 'sonographer' ? 'Sonographer' : 'Radiographer'} ${profile?.displayName || 'Unknown'} uploaded ${processedImages.length} medical images for Patient ID ${patientId}, Study Request ${requestId}.`,
        targetId: requestId
      });
      
      // Update local counts
      const procId = procedure.id || procIdx.toString();
      setExistingImagesCount(prev => ({
        ...prev,
        [procId]: (prev[procId] || 0) + processedImages.length
      }));

      // Clear local files for this procedure
      setProcedureFiles(prev => ({ ...prev, [procIdx]: [] }));
      setProcedurePreviews(prev => ({ ...prev, [procIdx]: [] }));

      toast.success(`Uploaded ${processedImages.length} images for ${procedure.name}`);
      
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
      setUploadingForProc(null);
    }
  };

  const finalizeStudy = async () => {
    if (!patientId || !requestId) return;
    setUploading(true);
    setStatusMessage('Finalizing Study Registration...');
    setProgress(50);

    try {
      const hasUltrasound = (procedures || []).some((p: any) => ULTRASOUND_PROCEDURES.includes(p.name));
      const requestRef = doc(db, 'patients', patientId, 'requests', requestId);
      await writeBatch(db).update(requestRef, {
        status: needsReport ? 'Images Uploaded' : 'Completed',
        needsReport: needsReport,
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        radiographerHistory: radiographerHistory,
        radiographerId: profile?.uid,
        radiographerName: profile?.displayName || 'Unknown'
      }).commit();

      setProgress(100);
      setIsFinished(true);
      toast.success(needsReport ? 'Study finalized and sent for radiologist reporting!' : 'Study finalized and completed successfully!');
    } catch (err) {
      console.error('Finalize error:', err);
      toast.error('Failed to finalize study');
    } finally {
      setUploading(false);
    }
  };

  const notifyRadiologist = () => {
    const radio = radiologists.find(r => r.id === selectedRadiologist);
    if (!radio || !radio.email) {
      toast.error('Please select a radiologist with a valid email.');
      return;
    }

    const subject = `Diagnostic Case Assignment: ${patientName} (${studyModality || 'Study'}) - Workstation Alert`;
    const reportingUrl = `${window.location.origin}/reporting`; // Internal portal link
    const rawTemplate = profile?.radiologistEmailTemplate || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
Radiology Reporting Assignment

Dear Dr. {radiologistName},

A new diagnostic study has been successfully acquired, processed, and uploaded to the workstation. This case is triaged and awaiting your clinical interpretation and formal sign-offs.

CASE DETAIL SHEET:
• Patient Name: {patientName}
• Study Type:   {studyType}

WORKLIST LINK:
You can review, examine, and report directly on your Worklist portal:
{reportingUrl}

FACILITY & WORKSTATION DESK:
{facilityName} (Tamale Main)
Official Location: Saint Charles Road (Before Attaesibi Hotel), Digital Address NT-0061-5616, Tamale, Northern Region, Ghana
Official Contact Lines: +233 50 025 2793 / +233 55 058 3106
Operating Hours: Mon–Fri: 8:30 AM–6:00 PM | Sat: 9:00 AM–6:00 PM | Sun: 10:30 AM–4:00 PM

Thank you for your expertise and for being a part of the {facilityName} Clinical Team.

Warm regards,

Administrative Desk
{facilityName}`;
    
    // Clean up any legacy text or spam triggers if stored in user profile
    const cleanedTemplate = rawTemplate
      .replace(/[┌┐└┘│]/g, '')
      .replace(/─{3,}/g, '----------------------------------------')
      .replace(/⭐\s*Rated\s*4\.8\/5\s*Stars.*$/gm, '')
      .replace(/⭐\s*\*?4\.8\/5★.*$/gm, '')
      .replace(/URGENT:\s*/gi, '')
      .replace(/🔑|▶|📋|🏥|⭐|🗝|🌐|✨/g, '')
      .replace(/Ayana Complex,?\s*Hospital Road,?\s*Tamale/gi, "Saint Charles Road (Before Attaesibi Hotel), Digital Address NT-0061-5616, Tamale, Northern Region, Ghana")
      .replace(/Ayana Complex/gi, "Saint Charles Road (Before Attaesibi Hotel)")
      .replace(/Hospital Road/gi, "Saint Charles Road")
      .replace(/\+233\s*244[- ]*818390/gi, "+233 50 025 2793 / +233 55 058 3106")
      .replace(/King's Diagnostic Imaging and Research Center and Research Centre/gi, "{facilityName}")
      .replace(/King's Diagnostic Imaging and Research Center and Research Center/gi, "{facilityName}")
      .replace(/Golden Heart Diagnostic Imaging Center/gi, "{facilityName}")
      .replace(/Golden Heart Diagnostic Imaging/gi, "{facilityName}")
      .replace(/Golden Heart/gi, "{facilityName}");

    const facilityName = profile?.facilityName || "King's Diagnostic Imaging and Research Center";

    const body = cleanedTemplate
      .replace(/{radiologistName}/g, radio.displayName || 'Radiologist')
      .replace(/{patientName}/g, patientName)
      .replace(/{studyType}/g, radiographerHistory || 'Standard Study')
      .replace(/{reportingUrl}/g, reportingUrl)
      .replace(/{facilityName}/g, facilityName);
    
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${radio.email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
    toast.success(`Notification link opened for Dr. ${radio.displayName}`);
    setShowAccessPass(true);
  };

  const activeProc = procedures[activeProcedureIndex];
  const activeProcName = activeProc 
    ? (typeof activeProc === 'string' ? activeProc : (activeProc.name || activeProc.partName || activeProc.procedureName || ''))
    : '';

  const isSonographer = profile?.role === 'sonographer';
  const isRadiographer = profile?.role === 'radiographer';
  const isXRayOrMammo = isXRayOrMammographyProcedure(activeProc, studyModality);

  // Upload restriction rules:
  // 1. Sonographer is not permitted to upload any images.
  // 2. Radiographer is permitted to upload ONLY for X-Ray and Mammography procedures.
  const isUploadRestricted = isSonographer || (isRadiographer && !isXRayOrMammo);

  return (
    <div className="space-y-8 p-4 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-glow mb-1">STUDY UPLOAD</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-muted text-sm flex items-center gap-2">
              PATIENT: <span className="text-main font-bold uppercase tracking-tight">{patientName || 'Loading...'}</span>
            </p>
            <p className="text-muted text-sm flex items-center gap-2 border-l border-white/10 pl-4">
              ID: <span className="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded text-xs">{patientId}</span>
            </p>
          </div>
          <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-400 font-bold uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Secure Storage Enabled
          </div>
        </div>
        <div className="flex gap-2">
           <div className="px-4 py-2 rounded-lg bg-black/40 border border-white/10 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Connectivity: High</span>
           </div>
        </div>
      </div>

      {uploading ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 flex flex-col items-center justify-center text-center space-y-8 min-h-[400px]"
        >
          <div className="relative w-48 h-48">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="12"
                fill="transparent"
                className="text-primary/5"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={553}
                strokeDashoffset={553 - (553 * progress) / 100}
                className="text-primary"
                strokeLinecap="round"
                initial={{ strokeDashoffset: 553 }}
                animate={{ strokeDashoffset: 553 - (553 * progress) / 100 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black font-mono">{progress}%</span>
              <span className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Complete</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-glow">{statusMessage}</h2>
            <div className="flex items-center justify-center gap-2 text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-mono uppercase tracking-wider">
                Synchronizing with Secure Storage
              </p>
            </div>
          </div>
        </motion.div>
      ) : isFinished ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 flex flex-col items-center justify-center text-center space-y-8"
        >
          <div className="w-24 h-24 bg-success/20 rounded-full flex items-center justify-center text-success mb-4">
            <CheckCircle size={48} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tighter">IMAGES UPLOADED SUCCESSFULLY</h2>
            <p className="text-muted max-w-md mx-auto">The study is now in the system. What would you like to do next?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            {needsReport && (
              <div className="glass-panel p-6 space-y-4 border-primary/30 bg-primary/5">
                <div className="text-left">
                  <h3 className="text-sm font-black uppercase text-primary mb-1">Assign Radiologist</h3>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-4">Choose a specialist to alert via email</p>
                </div>
                
                <select 
                  value={selectedRadiologist}
                  onChange={(e) => setSelectedRadiologist(e.target.value)}
                  className="glass-input w-full text-sm"
                >
                  <option value="">Select Radiologist...</option>
                  {radiologists.map(r => (
                    <option key={r.id} value={r.id}>{r.displayName} ({r.email || 'No email'})</option>
                  ))}
                </select>

                <button 
                  onClick={notifyRadiologist}
                  disabled={!selectedRadiologist}
                  className="w-full py-3 bg-primary text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-105"
                >
                  <Mail size={18} />
                  Send Gmail Alert
                </button>
              </div>
            )}

            <div className="glass-panel p-6 space-y-4 flex flex-col justify-between">
              <div className="text-left">
                <h3 className="text-sm font-black uppercase text-muted mb-1">Patient Documents</h3>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-4">Generate access pass for the patient</p>
              </div>
              
              <button 
                onClick={() => setShowAccessPass(true)}
                className="w-full py-3 bg-white/10 text-main font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
              >
                <UserCheck size={18} />
                Print Access Pass
              </button>
            </div>
          </div>

          <button 
            onClick={() => navigate('/pending')}
            className="text-sm font-bold text-muted underline underline-offset-4 hover:text-main"
          >
            Skip and return to Dashboard
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {isUploadRestricted ? (
              <div className="glass-card p-12 border border-white/10 flex flex-col items-center justify-center text-center space-y-6 min-h-[300px]">
                <div className="p-4 bg-warning/10 rounded-full">
                  <AlertCircle className="w-12 h-12 text-warning" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-main uppercase">
                    {isSonographer ? 'Image Upload Restricted' : 'Upload Restricted to X-Ray & Mammography'}
                  </h3>
                  <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">
                    {isSonographer
                      ? 'Sonographers are not permitted to upload medical images. Image uploads are restricted strictly to Radiographers for X-Ray and Mammography procedures.'
                      : `As a Radiographer, you are only authorized to upload images for X-Ray and Mammography procedures. Uploads for ${activeProcName || 'this procedure type'} are restricted.`}
                  </p>
                  <p className="text-xs text-primary font-bold uppercase tracking-widest mt-2">
                    {isSonographer
                      ? 'Please coordinate with a Radiographer for X-Ray/Mammography uploads.'
                      : 'Radiographers can only upload X-Ray and Mammography studies.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div 
                  className={cn(
                    "glass-card p-12 border-2 border-dashed transition-all cursor-pointer group relative overflow-hidden",
                    (procedureFiles[activeProcedureIndex]?.length || 0) > 0 ? "border-primary/40 bg-primary/5" : "border-white/10 hover:border-primary/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,.dcm,application/dicom"
                  />
                  <div className="flex flex-col items-center gap-6 relative z-10">
                    <div className="p-6 bg-primary/10 rounded-full group-hover:scale-110 transition-transform">
                      <ImagePlus className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-bold mb-2">
                        {procedures[activeProcedureIndex]?.name || procedures[activeProcedureIndex]?.partName ? `UPLOAD FOR ${(procedures[activeProcedureIndex].name || procedures[activeProcedureIndex].partName).toUpperCase()}` : 'ADD STUDY IMAGES'}
                      </h3>
                      <p className="text-muted max-w-sm mx-auto">
                        Files will be securely stored. Supports DICOM, PNG, and JPEG.
                      </p>
                    </div>
                  </div>
                </div>

                {((procedureFiles[activeProcedureIndex]?.length || 0) > 0) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Review for {procedures[activeProcedureIndex]?.name || procedures[activeProcedureIndex]?.partName} ({procedureFiles[activeProcedureIndex].length} items)
                      </h3>
                      <button 
                        onClick={() => { 
                          setProcedureFiles(prev => ({ ...prev, [activeProcedureIndex]: [] })); 
                          setProcedurePreviews(prev => ({ ...prev, [activeProcedureIndex]: [] })); 
                        }}
                        className="text-[10px] font-bold text-danger uppercase hover:underline"
                      >
                        Discard These
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2">
                      {procedureFiles[activeProcedureIndex]?.map((file, i) => (
                        <div key={i} className="group relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40">
                          {procedurePreviews[activeProcedureIndex]?.[i] ? (
                            <img src={procedurePreviews[activeProcedureIndex][i]} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted p-4">
                              <File className="w-8 h-8 opacity-20" />
                              <span className="text-[10px] font-mono break-all text-center">{file.name.slice(-15)}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                              className="p-2 bg-danger text-white rounded-full hover:scale-110 transition-transform"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square flex flex-col items-center justify-center border border-dashed border-white/10 rounded-lg hover:border-primary/50 transition-colors bg-white/5"
                      >
                        <Plus className="w-6 h-6 text-primary" />
                        <span className="text-[10px] font-bold uppercase mt-2">Add More</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6">
             <div className="glass-card p-6 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted border-b border-white/5 pb-4">Study Context</h3>
                
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Requested Studies</label>
                       <span className="text-[10px] text-muted italic font-mono">Select to start upload</span>
                    </div>
                    <div className="space-y-2">
                       {procedures.length > 0 ? (
                         procedures.map((proc, idx) => (
                           <button 
                             key={idx} 
                             onClick={() => setActiveProcedureIndex(idx)}
                             className={cn(
                               "w-full text-left p-3 border rounded-xl flex items-center justify-between group transition-all",
                               activeProcedureIndex === idx 
                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]" 
                                : "bg-white/5 border-white/5 hover:border-white/20"
                             )}
                           >
                             <div className="flex-1">
                                <div className="flex items-center gap-2">
                                   <p className={cn(
                                     "text-xs font-bold uppercase transition-colors",
                                     activeProcedureIndex === idx ? "text-primary" : "text-main group-hover:text-primary"
                                   )}>
                                     {proc.name}
                                   </p>
                                   {procedureFiles[idx]?.length > 0 && (
                                     <span className="text-[10px] font-black text-amber-500 flex items-center gap-1">
                                       <Loader2 className="w-3 h-3 animate-spin" />
                                       {procedureFiles[idx].length} PENDING
                                     </span>
                                   )}
                                   {existingImagesCount[proc.id || idx.toString()] > 0 && (
                                     <span className="text-[10px] font-black text-success flex items-center gap-1">
                                       <CheckCircle className="w-3 h-3" />
                                       {existingImagesCount[proc.id || idx.toString()]} STORED
                                     </span>
                                   )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                   <span className={cn(
                                     "text-[8px] px-1.5 py-0.5 rounded font-mono uppercase",
                                     activeProcedureIndex === idx ? "bg-primary/20 text-primary" : "bg-white/10 text-muted"
                                   )}>
                                     {proc.laterality || 'None'}
                                   </span>
                                   {proc.needsReport && (
                                     <span className="text-[8px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold uppercase tracking-wider">
                                       Report Requested
                                     </span>
                                   )}
                                </div>
                             </div>
                             <div className={cn(
                               "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors",
                               activeProcedureIndex === idx ? "bg-primary text-black border-primary" : "border-white/10 text-muted"
                             )}>
                                {idx + 1}
                             </div>
                           </button>
                         ))
                       ) : (
                         <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-xl text-center">
                            <p className="text-[10px] text-muted uppercase">No procedures listed</p>
                         </div>
                       )}
                    </div>
                 </div>

                <div className="space-y-4">
                   <label htmlFor="clinical-indications" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted block">Clinical Indications</label>
                   <textarea
                     id="clinical-indications"
                     name="clinicalIndications"
                     value={radiographerHistory}
                     onChange={(e) => setRadiographerHistory(e.target.value)}
                     placeholder="Enter any pertinent clinical history or observations..."
                     className="w-full h-40 bg-black/60 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                   />
                </div>

                {error === 'SUPABASE_RLS_ERROR' ? (
                  <div className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-4">
                    <div className="flex items-start gap-3 text-amber-500">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-1" />
                      <div className="space-y-1">
                        <p className="font-bold text-sm uppercase text-glow-amber">Supabase Policy Needed</p>
                        <p className="text-xs leading-relaxed opacity-90">
                          Your Supabase Storage bucket is rejecting the upload due to <strong>Row Level Security (RLS)</strong>.
                        </p>
                      </div>
                    </div>
                    <div className="bg-black/40 p-3 rounded-lg border border-white/5 space-y-3">
                       <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Quick Fix:</p>
                       <ol className="text-[10px] text-muted space-y-2 list-decimal ml-4">
                         <li>Go to <strong>Supabase Dashboard</strong> &gt; <strong>Storage</strong>.</li>
                         <li>Ensure bucket <code className="text-amber-400">studies</code> exists and is <strong>Public</strong>.</li>
                         <li>Click <strong>Policies</strong> &gt; <strong>New Policy</strong>.</li>
                         <li>Use "Get started quickly" &gt; <strong>"Give users access to all operations"</strong>.</li>
                         <li>Click "Save" and try again.</li>
                       </ol>
                    </div>
                    <button 
                      onClick={() => { setError(null); setUploading(false); setProgress(0); }}
                      className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      I updated the policy - Try Again
                    </button>
                  </div>
                ) : error && (
                  <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs flex gap-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-bold">Upload Failed</p>
                      <p className="opacity-80">{error}</p>
                      <p className="text-[9px] mt-2 italic">
                        Ensure storage keys are configured in Settings.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {!isUploadRestricted && (
                    <button 
                      disabled={(!procedureFiles[activeProcedureIndex] || procedureFiles[activeProcedureIndex].length === 0) || uploading}
                      onClick={() => handleSingleUpload(activeProcedureIndex)}
                      className={cn(
                        "flex-1 py-4 rounded-xl font-black uppercase tracking-tighter text-sm flex items-center justify-center gap-3 transition-all",
                        (!procedureFiles[activeProcedureIndex] || procedureFiles[activeProcedureIndex].length === 0) || uploading
                          ? "bg-white/5 text-muted cursor-not-allowed" 
                          : "bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] active:scale-[0.98]"
                      )}
                    >
                      {uploadingForProc === activeProcedureIndex ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                      Upload {procedures[activeProcedureIndex]?.name || procedures[activeProcedureIndex]?.partName || 'Study'}
                    </button>
                  )}

                  <button 
                    onClick={finalizeStudy}
                    disabled={uploading}
                    className={cn(
                      "px-6 py-4 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all text-muted hover:text-main",
                      isUploadRestricted && "w-full"
                    )}
                  >
                    Finalize Request
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {showAccessPass && (
        <AccessPassModal 
          isOpen={showAccessPass}
          onClose={() => {
            setShowAccessPass(false);
            navigate('/pending');
          }}
          patient={{
            id: patientId || '',
            name: patientName,
            requestId: requestId,
            accessCode: accessCode
          }}
          facilityName={facilityInfo.name}
          facilityLogo={facilityInfo.logo}
        />
      )}
    </div>
  );
}
