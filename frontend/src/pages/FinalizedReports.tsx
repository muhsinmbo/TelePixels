import React, { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, doc, getDoc, collection, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../lib/utils';
import { FileText, Printer, Search, User, Eye, Download, History, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';
import { generateProfessionalPDF, generateSonographerPDF } from '../services/reportPdfService';
import { useSearchParams } from 'react-router-dom';

interface Report {
  id: string;
  procedureName: string;
  findings: string;
  impression: string;
  clinicalHistory?: string;
  radiologistName: string;
  facilityName?: string;
  facilityLetterhead?: string;
  pdfReports?: { name: string; data: string }[];
  createdAt: any;
  isDraft: boolean;
  procedureIdx: number;
  isSonographerWorksheet?: boolean;
  worksheetData?: any;
}

interface Request {
  id: string;
  patientId: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  modalities: string[];
  procedures?: any[];
  status: string;
  priority: string;
  createdAt: any;
  completedAt?: any;
  sonographerWorksheets?: any;
  sonographerWorksheet?: any;
  procedureName?: string;
}

import DateFilterDropdown from '../components/DateFilterDropdown';

export default function FinalizedReports() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>(searchParams.get('search') ? 'all' : 'today');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });

  useEffect(() => {
    if (!profile) return;

    // Fetch Completed or Finalized requests
    const q = query(
      collectionGroup(db, 'requests'), 
      where('status', 'in', ['Completed', 'Finalized', 'completed', 'finalized', 'Partially Reported']),
      where('facilityId', '==', 'default-facility')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchPromises = snapshot.docs.map(async (snapshotDoc) => {
          const reqData = snapshotDoc.data() as Request;
          const patientId = snapshotDoc.ref.parent.parent?.id;
          if (patientId) {
            const patientSnap = await getDoc(doc(db, 'patients', patientId));
            const pData = patientSnap.exists() ? patientSnap.data() : null;
            return { 
              ...reqData, 
              id: snapshotDoc.id, 
              patientId, 
              patientName: pData?.name || 'Unknown Patient',
              patientAge: pData?.age,
              patientGender: pData?.gender
            };
          }
          return { ...reqData, id: snapshotDoc.id, patientId: 'N/A', patientName: 'N/A' };
        });
        
        const data = await Promise.all(fetchPromises);
        setRequests(data.sort((a, b) => {
          const aTime = a.completedAt?.seconds || a.createdAt?.seconds || 0;
          const bTime = b.completedAt?.seconds || b.createdAt?.seconds || 0;
          return bTime - aTime;
        }));
      } catch (err) {
        console.error("Error fetching finalized requests:", err);
      } finally {
        setLoading(false);
      }
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
  }, [profile]);

  useEffect(() => {
    if (!selectedRequest) {
      setReports([]);
      return;
    }

    setLoadingReports(true);
    const reportsRef = collection(db, 'patients', selectedRequest.patientId, 'requests', selectedRequest.id, 'reports');
    // We want only finalized reports (not drafts)
    const q = query(reportsRef, where('isDraft', '==', false), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbReports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Report));
      
      const sonographerReports: Report[] = [];
      if (selectedRequest.sonographerWorksheets && typeof selectedRequest.sonographerWorksheets === 'object') {
        Object.entries(selectedRequest.sonographerWorksheets).forEach(([idxKey, ws]: [string, any]) => {
          if (ws && (ws.findings || ws.impression || ws.comments || ws.pdfUrl || ws.uploadedPdfUrl)) {
            const procIndex = parseInt(idxKey);
            let procName = 'Ultrasound Exam';
            if (selectedRequest.procedures && selectedRequest.procedures[procIndex]) {
              const p = selectedRequest.procedures[procIndex];
              procName = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Ultrasound Exam');
            } else if (selectedRequest.procedureName) {
              procName = selectedRequest.procedureName;
            }
            sonographerReports.push({
              id: `sonographer_${idxKey}`,
              procedureName: procName + ' (Sonogram)',
              findings: ws.findings || '',
              impression: ws.impression || '',
              clinicalHistory: ws.clinicalHistory || '',
              radiologistName: ws.sonographerName || 'Sonographer',
              isSonographerWorksheet: true,
              worksheetData: { ...ws, procedureName: procName },
              createdAt: ws.updatedAt || ws.createdAt || selectedRequest.createdAt,
              isDraft: false,
              procedureIdx: procIndex
            });
          }
        });
      }

      if (sonographerReports.length === 0 && selectedRequest.sonographerWorksheet && (selectedRequest.sonographerWorksheet.findings || selectedRequest.sonographerWorksheet.impression || selectedRequest.sonographerWorksheet.comments || selectedRequest.sonographerWorksheet.pdfUrl || selectedRequest.sonographerWorksheet.uploadedPdfUrl)) {
        sonographerReports.push({
          id: 'sonographer_legacy',
          procedureName: (selectedRequest.procedureName || 'Ultrasound Exam') + ' (Sonogram)',
          findings: selectedRequest.sonographerWorksheet.findings || '',
          impression: selectedRequest.sonographerWorksheet.impression || '',
          clinicalHistory: selectedRequest.sonographerWorksheet.clinicalHistory || '',
          radiologistName: selectedRequest.sonographerWorksheet.sonographerName || 'Sonographer',
          isSonographerWorksheet: true,
          worksheetData: { ...selectedRequest.sonographerWorksheet, procedureName: selectedRequest.procedureName || 'Ultrasound Exam' },
          createdAt: selectedRequest.sonographerWorksheet.updatedAt || selectedRequest.sonographerWorksheet.createdAt || selectedRequest.createdAt,
          isDraft: false,
          procedureIdx: 0
        });
      }

      setReports([...dbReports, ...sonographerReports]);
      setLoadingReports(false);
    }, (err) => {
      console.error("Error fetching reports:", err);
      setLoadingReports(false);
    });

    return unsubscribe;
  }, [selectedRequest]);

  const handlePrintReport = (report: Report) => {
    if (!selectedRequest) return;

    try {
      if (report.isSonographerWorksheet) {
        const targetPdf = report.worksheetData?.pdfUrl || report.worksheetData?.uploadedPdfUrl;
        if (targetPdf) {
          const win = window.open();
          if (win) {
            win.document.write(`<iframe src="${targetPdf}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
            win.document.title = report.procedureName;
          }
          return;
        }

        const docObj = generateSonographerPDF({
          patient: {
            name: selectedRequest.patientName || 'Unknown',
            id: selectedRequest.patientId,
            age: selectedRequest.patientAge,
            gender: selectedRequest.patientGender
          },
          request: {
            createdAt: selectedRequest.createdAt,
            id: selectedRequest.id
          },
          worksheet: report.worksheetData,
          facility: {
            name: facilityInfo.name || report.facilityName || profile?.facilityName,
            letterhead: facilityInfo.letterhead || report.facilityLetterhead || profile?.facilityLetterhead
          }
        });

        const pdfDataUrl = docObj.output('datauristring');
        const win = window.open();
        if (win) {
          win.document.write(`<iframe src="${pdfDataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
          win.document.title = report.procedureName;
        }
        return;
      }

      // If there are uploaded PDFs, prioritize them or show selection? 
      // User says "receptionist should be able to print pdf reports of patients when the are uploaded"
      // If we have uploaded PDF data, open it.
      if (report.pdfReports && report.pdfReports.length > 0) {
        report.pdfReports.forEach(pdf => {
          const win = window.open();
          if (win) {
            win.document.write(`<iframe src="${pdf.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
            win.document.title = pdf.name;
          }
        });
        return;
      }

      // Otherwise generate professional PDF
      const doc = generateProfessionalPDF({
        patient: {
          name: selectedRequest.patientName || 'Unknown',
          id: selectedRequest.patientId,
          age: selectedRequest.patientAge,
          gender: selectedRequest.patientGender
        },
        request: {
          createdAt: selectedRequest.createdAt,
          id: selectedRequest.id
        },
        report: {
          procedureName: report.procedureName,
          clinicalHistory: report.clinicalHistory,
          findings: report.findings,
          impression: report.impression,
          radiologistName: report.radiologistName,
          createdAt: report.createdAt
        },
        facility: {
          name: facilityInfo.name || report.facilityName || profile?.facilityName,
          letterhead: facilityInfo.letterhead || report.facilityLetterhead || profile?.facilityLetterhead
        }
      });

      const pdfDataUrl = doc.output('datauristring');
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${pdfDataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        win.document.title = `Report - ${report.procedureName}`;
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to open report');
    }
  };

  const handleDownloadReport = (report: Report) => {
    if (!selectedRequest) return;

    try {
      if (report.isSonographerWorksheet) {
        const docObj = generateSonographerPDF({
          patient: {
            name: selectedRequest.patientName || 'Unknown',
            id: selectedRequest.patientId,
            age: selectedRequest.patientAge,
            gender: selectedRequest.patientGender
          },
          request: {
            createdAt: selectedRequest.createdAt,
            id: selectedRequest.id
          },
          worksheet: report.worksheetData,
          facility: {
            name: facilityInfo.name || report.facilityName || profile?.facilityName,
            letterhead: facilityInfo.letterhead || report.facilityLetterhead || profile?.facilityLetterhead
          }
        });

        const filename = `Worksheet_${selectedRequest.patientName?.replace(/\s+/g, '_') || 'Patient'}_${selectedRequest.patientId}.pdf`;
        docObj.save(filename);
        toast.success(`Download started for worksheet: ${report.procedureName}`);
        return;
      }

      if (report.pdfReports && report.pdfReports.length > 0) {
        report.pdfReports.forEach(pdf => {
          const link = document.createElement('a');
          link.href = pdf.data;
          link.download = pdf.name || 'Report.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
        toast.success('Download started for uploaded PDFs');
        return;
      }

      const doc = generateProfessionalPDF({
        patient: {
          name: selectedRequest.patientName || 'Unknown',
          id: selectedRequest.patientId,
          age: selectedRequest.patientAge,
          gender: selectedRequest.patientGender
        },
        request: {
          createdAt: selectedRequest.createdAt,
          id: selectedRequest.id
        },
        report: {
          procedureName: report.procedureName,
          clinicalHistory: report.clinicalHistory,
          findings: report.findings,
          impression: report.impression,
          radiologistName: report.radiologistName,
          createdAt: report.createdAt
        },
        facility: {
          name: facilityInfo.name || report.facilityName || profile?.facilityName,
          letterhead: facilityInfo.letterhead || report.facilityLetterhead || profile?.facilityLetterhead
        }
      });

      const filename = `Report_${selectedRequest.patientName?.replace(/\s+/g, '_') || 'Patient'}_${selectedRequest.patientId}.pdf`;
      doc.save(filename);
      toast.success(`Download started for report: ${report.procedureName}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to download PDF document.');
    }
  };

  const allowedReports = reports.filter(report => {
    if (profile?.role === 'sonographer') {
      return !!report.isSonographerWorksheet;
    }
    if (profile?.role === 'radiologist') {
      const isXrayReport = report.procedureName?.toLowerCase().includes('x-ray') || 
                           report.procedureName?.toLowerCase().includes('xray') ||
                           report.procedureName?.toLowerCase().includes('xr');
      return !report.isSonographerWorksheet && isXrayReport;
    }
    return true; // receptionist, admins can access both
  });

  const filteredRequests = requests.filter(req => {
    // Sonographers should only see ultrasound requests or requests with sonographer reports
    if (profile?.role === 'sonographer') {
      const hasUltrasound = req.modalities?.some(m => m.toLowerCase().includes('ultrasound')) || 
                            req.procedures?.some((p: any) => {
                              const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || '');
                              return name.toLowerCase().includes('ultrasound');
                            }) || !!req.sonographerWorksheets || !!req.sonographerWorksheet;
      if (!hasUltrasound) return false;
    }

    // Radiologists should only see X-Ray processed requests
    if (profile?.role === 'radiologist') {
      const hasXray = req.modalities?.some(m => m.toLowerCase().includes('x-ray') || m.toLowerCase().includes('xray') || m.toLowerCase().includes('xr')) || 
                      req.procedures?.some((p: any) => {
                        const name = typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || '');
                        return name.toLowerCase().includes('x-ray') || name.toLowerCase().includes('xray') || name.toLowerCase().includes('xr');
                      });
      if (!hasXray) return false;
    }

    const matchesSearch = 
      req.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.patientId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = () => {
      if (dateFilter === 'all') return true;
      const date = req.completedAt?.toDate?.() || req.createdAt?.toDate?.() || new Date();
      const now = new Date();
      if (dateFilter === 'today') return date.toDateString() === now.toDateString();
      if (dateFilter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return date.toDateString() === yesterday.toDateString();
      }
      if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return date >= weekAgo;
      }
      return true;
    };

    return matchesSearch && matchesDate();
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold">Finalized Reports</h1>
          <p className="text-muted text-sm">View and print finalized diagnostic reports.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="glass-panel p-3 flex items-center gap-3 flex-1">
          <Search className="text-muted w-5 h-5 ml-1" />
          <input 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by Patient Name or ID..."
            className="bg-transparent border-none focus:outline-none flex-1 text-main text-sm"
          />
        </div>

        <DateFilterDropdown 
          value={dateFilter} 
          onChange={setDateFilter} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 overflow-hidden">
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-6 py-4 text-sm font-medium text-muted">Patient</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">Study</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted">Completed</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">Loading studies...</td></tr>
                ) : filteredRequests.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">No finalized studies found</td></tr>
                ) : filteredRequests.map(req => (
                  <tr 
                    key={req.id} 
                    className={cn(
                      "hover:bg-white/5 transition-colors group cursor-pointer",
                      selectedRequest?.id === req.id ? "bg-white/10" : ""
                    )}
                    onClick={() => setSelectedRequest(req)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <User className="w-4 h-4 text-muted" />
                        <div>
                          <span className="font-bold block">{req.patientName}</span>
                          <span className="font-mono text-[10px] text-primary/70">{req.patientId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold text-main uppercase bg-white/5 px-2 py-1 rounded">
                        {req.modalities.join(', ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {formatDate(req.completedAt || req.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 bg-primary/10 text-primary rounded-lg">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass-panel p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Available Reports
            </h2>

            {!selectedRequest ? (
              <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <History className="w-8 h-8 text-muted mx-auto mb-3 opacity-20" />
                <p className="text-xs text-muted">Select a study to view reports</p>
              </div>
            ) : loadingReports ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : allowedReports.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <AlertCircle className="w-8 h-8 text-warning mx-auto mb-3 opacity-20" />
                <p className="text-xs text-muted">No finalized reports found for this study.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allowedReports.map((report) => (
                  <div key={report.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold">{report.procedureName}</p>
                        <p className="text-[10px] text-muted uppercase">
                          {report.isSonographerWorksheet ? "By Sonographer" : "By Dr."} {report.radiologistName}
                        </p>
                      </div>
                      <div className="px-2 py-0.5 rounded bg-success/20 text-success text-[10px] font-bold uppercase">
                        Finalized
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handlePrintReport(report)}
                        className="flex-1 glass-btn bg-white/10 text-main hover:bg-white/20 text-xs font-bold py-2.5 flex items-center justify-center gap-2 border border-white/10"
                        title="View / Print PDF"
                      >
                        <Printer className="w-4 h-4 text-primary" />
                        Print
                      </button>
                      <button 
                        onClick={() => handleDownloadReport(report)}
                        className="flex-1 glass-btn bg-primary text-black hover:bg-primary/80 text-xs font-bold py-2.5 flex items-center justify-center gap-2"
                        title="Download PDF directly"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
