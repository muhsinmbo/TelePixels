import React, { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../lib/utils';
import { Clock, AlertCircle, Upload, User, Eye, QrCode, FileText, Search, Filter, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';
import { logAction } from '../services/loggerService';
import AccessPassModal from '../components/AccessPassModal';
import { isXRayOrMammographyProcedure } from '../constants';

interface Request {
  id: string;
  patientId: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  modalities: string[];
  procedures?: any[];
  totalCost?: number;
  bodyParts?: string;
  laterality?: string;
  status: string;
  priority: string;
  createdAt: any;
  needsReport?: boolean;
  imageCount?: number;
  accessCode?: string;
}

import DateFilterDropdown from '../components/DateFilterDropdown';
import FilterDropdown from '../components/FilterDropdown';

export default function PendingRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'STAT' | 'urgent' | 'routine'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in progress' | 'images uploaded' | 'completed'>('all');
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
          } else if (norm === 'echo') {
            classes = "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
          } else if (norm === 'ecg') {
            classes = "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20";
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
  const [showAccessPass, setShowAccessPass] = useState(false);
  const [showWorksheet, setShowWorksheet] = useState(false);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setFacilityInfo({
          name: data.facilityName || '',
          logo: data.facilityLogo || ''
        });
      }
    });
    return () => unsub();
  }, []);

  const canUploadForRequest = (req: Request) => {
    if (!profile) return true;
    if (profile.role === 'sonographer') return false;
    if (profile.role === 'radiographer') {
      const procs = req.procedures || (req as any).lastProcedures || [];
      const reqModality = req.modalities?.[0] || (req as any).modality || (req as any).selectedParts?.[0]?.modality;
      if (procs.length === 0) {
        return isXRayOrMammographyProcedure(req.bodyParts || (req as any).selectedParts || null, reqModality);
      }
      return procs.some((p: any) => isXRayOrMammographyProcedure(p, reqModality || p.modality));
    }
    return true;
  };
  const [worksheetRequest, setWorksheetRequest] = useState<Request | null>(null);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collectionGroup(db, 'requests'), 
      where('status', 'in', ['pending', 'images uploaded', 'in progress', 'Pending', 'Images Uploaded', 'In Progress', 'Completed', 'completed', 'Finalized', 'finalized']),
      where('facilityId', '==', 'default-facility')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const fetchPromises = snapshot.docs.map(async (snapshotDoc) => {
          const reqData = snapshotDoc.data() as Request;
          const patientId = snapshotDoc.ref.parent.parent?.id;
          if (patientId) {
            try {
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
            } catch (err) {
              console.error(`Error fetching patient ${patientId}:`, err);
              return { ...reqData, id: snapshotDoc.id, patientId, patientName: 'Error Loading' };
            }
          }
          return { ...reqData, id: snapshotDoc.id, patientId: 'N/A', patientName: 'N/A' };
        });
        
        const data = await Promise.all(fetchPromises);
        
        data.sort((a, b) => {
          const priorityScore = (p: string) => p === 'STAT' ? 3 : p === 'urgent' ? 2 : 1;
          if (priorityScore(a.priority) !== priorityScore(b.priority)) {
            return priorityScore(b.priority) - priorityScore(a.priority);
          }
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
          return (bTime || 0) - (aTime || 0);
        });

        setRequests(data);
      } catch (err) {
        console.error("Error processing snapshot:", err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("PendingRequests Snapshot Error:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const filteredRequests = requests.filter(req => {
    // Role-specific workflow isolation
    if (profile?.role === 'sonographer') {
      const isUltrasound = req.modalities?.some(m => {
        const norm = m.trim().toLowerCase();
        return norm === 'ultrasound' || norm === 'us' || norm === 'echo' || norm === 'ecg';
      });
      if (!isUltrasound) return false;

      const isSonographerCompleted = (req as any).sonographerStatus === 'Completed' || (req as any).sonographerWorksheetStatus === 'Completed';

      if (statusFilter === 'pending') {
        if (isSonographerCompleted) return false;
      } else if (statusFilter === 'completed') {
        if (!isSonographerCompleted) return false;
      }
    } else if (profile?.role === 'radiologist') {
      const isRadiologistCompleted = (req as any).radiologistStatus === 'Completed' || req.status?.toLowerCase() === 'completed' || req.status?.toLowerCase() === 'finalized';

      if (statusFilter === 'pending') {
        if (isRadiologistCompleted) return false;
      } else if (statusFilter === 'completed') {
        if (!isRadiologistCompleted) return false;
      }
    } else if (profile?.role === 'radiographer') {
      const isUltrasound = req.modalities?.some(m => {
        const norm = m.trim().toLowerCase();
        return norm === 'ultrasound' || norm === 'us' || norm === 'echo' || norm === 'ecg';
      });
      const hasOthers = req.modalities?.some(m => {
        const norm = m.trim().toLowerCase();
        return norm !== 'ultrasound' && norm !== 'us' && norm !== 'echo' && norm !== 'ecg';
      });
      if (isUltrasound && !hasOthers) {
        return false;
      }

      const isOverallCompleted = req.status?.toLowerCase() === 'completed' || req.status?.toLowerCase() === 'finalized';
      if (statusFilter === 'pending') {
        if (isOverallCompleted) return false;
      } else if (statusFilter === 'completed') {
        if (!isOverallCompleted) return false;
      }
    } else {
      const isOverallCompleted = req.status?.toLowerCase() === 'completed' || req.status?.toLowerCase() === 'finalized';
      if (statusFilter === 'pending') {
        if (isOverallCompleted) return false;
      } else if (statusFilter === 'completed') {
        if (!isOverallCompleted) return false;
      }
    }

    const matchesSearch = 
      req.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.modalities.some(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesPriority = priorityFilter === 'all' || req.priority.toLowerCase() === priorityFilter.toLowerCase();
    const matchesStatus = statusFilter === 'all' || req.status.toLowerCase() === statusFilter.toLowerCase();

    const matchesDate = () => {
      if (dateFilter === 'all') return true;
      let createdAtDate: Date;
      const rawDate = req.createdAt as any;
      
      if (rawDate && typeof rawDate.toDate === 'function') {
        createdAtDate = rawDate.toDate();
      } else {
        createdAtDate = new Date(rawDate);
      }

      if (isNaN(createdAtDate.getTime())) return true; // Show if date is invalid to avoid losing studies
      
      const now = new Date();
      if (dateFilter === 'today') {
        return createdAtDate.toDateString() === now.toDateString();
      }
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

    return matchesSearch && matchesPriority && matchesStatus && matchesDate();
  });

  const getRequestDate = (req: Request) => {
    const rawDate = req.createdAt;
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold">Pending Studies</h1>
          <p className="text-muted text-sm">Imaging requests awaiting upload or processing.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 overflow-visible">
        <div className="glass-panel p-3 flex items-center gap-3 flex-1 overflow-visible">
          <Search className="text-muted w-5 h-5 ml-1" />
          <input 
            id="pending-search"
            name="pendingSearch"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by Patient Name, ID, or Modality..."
            className="bg-transparent border-none focus:outline-none flex-1 text-main text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 overflow-visible pb-2 lg:pb-0">
          <FilterDropdown
            label="Priority"
            value={priorityFilter}
            onChange={(val) => setPriorityFilter(val as any)}
            icon={AlertCircle}
            options={[
              { value: 'all', label: 'All Priorities' },
              { value: 'STAT', label: 'STAT' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'routine', label: 'Routine' }
            ]}
          />

          <FilterDropdown
            label="Status"
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as any)}
            icon={Clock}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'in progress', label: 'In Progress' },
              { value: 'images uploaded', label: 'Uploaded' },
              { value: 'completed', label: 'Completed' }
            ]}
          />

          <div className="flex items-center gap-2">
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
              className="p-2.5 rounded-lg bg-white/10 border border-white/10 text-muted hover:text-main transition-all shadow-lg"
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
              <th className="px-6 py-4 text-sm font-medium text-muted">Requested</th>
              <th className="px-6 py-4 text-sm font-medium text-muted text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">Loading pending requests...</td></tr>
            ) : sortedRequests.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">No studies found matching criteria</td></tr>
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
                          {request.procedures && request.procedures.length > 0 
                            ? request.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Unknown')).join(', ')
                            : request.modalities.join(', ')
                          }
                        </span>
                       {request.imageCount !== undefined && request.imageCount > 0 && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">{request.imageCount} IMAGES</span>
                      )}
                    </div>
                    <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                      {renderModalityBadges(request.modalities)}
                      {request.bodyParts && <span>• {request.bodyParts} ({request.laterality})</span>}
                      {request.needsReport && (
                        <span className="text-info font-black uppercase text-[9px]">Report Req</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      (request.status === 'In Progress' || request.status === 'in progress') ? "bg-accent/20 text-accent" : 
                      (request.status === 'Images Uploaded' || request.status === 'images uploaded') ? "bg-success/20 text-success" : "bg-primary/20 text-primary"
                    )}>
                      {request.status}
                    </span>
                    {((request as any).activeReporter?.name || (request as any).radiologistName || (request as any).sonographerName) && (request.status === 'In Progress' || request.status === 'in progress') && (
                      <span className="text-[9px] text-amber-400 font-medium flex items-center justify-center gap-1">
                        <Users className="w-2.5 h-2.5" /> Reporting: {(request as any).activeReporter?.name || (request as any).radiologistName || (request as any).sonographerName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Clock className="w-3 h-3" />
                    {formatDate(request.createdAt)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {profile?.role === 'sonographer' && (
                      <Link 
                        to={`/ultrasound-report/${request.patientId}/${request.id}`}
                        className="glass-btn px-2.5 py-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 flex items-center justify-center shrink-0 gap-1.5"
                        title="Open Ultrasound Diagnostic Report Page"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Write Report</span>
                      </Link>
                    )}
                    {request.status !== 'Pending' && request.status !== 'pending' && (
                      <button 
                        onClick={() => { setSelectedRequest(request); setShowAccessPass(true); }}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 text-muted hover:text-primary hover:border-primary/30 transition-all"
                        title="Print Access Pass"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    )}
                    {canUploadForRequest(request) && request.status?.toLowerCase() !== 'finalized' && (
                      <Link 
                        to={`/upload/${request.patientId}/${request.id}`}
                        className="glass-btn p-2 bg-primary text-black flex items-center justify-center shrink-0"
                        title="Upload / Add Studies"
                      >
                        <Upload className="w-4 h-4" />
                      </Link>
                    )}
                    {profile?.role === 'radiographer' && !canUploadForRequest(request) && (
                      <span 
                        className="p-2 rounded-lg bg-white/5 border border-white/10 text-muted/40 cursor-not-allowed flex items-center justify-center shrink-0"
                        title="Radiographers can only upload X-Ray and Mammography procedures"
                      >
                        <Upload className="w-4 h-4" />
                      </span>
                    )}
                    {profile?.role !== 'sonographer' && (request.status?.toLowerCase() === 'images uploaded' || request.status?.toLowerCase() === 'in progress' || request.status?.toLowerCase() === 'completed' || request.status?.toLowerCase() === 'finalized') && (
                      <Link 
                        to={`/viewer?patientId=${request.patientId}&requestId=${request.id}`}
                        className="glass-btn p-2 bg-white/10 text-main flex items-center justify-center hover:bg-white/20 shrink-0"
                        title="View in DICOM Viewer"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AccessPassModal 
        isOpen={showAccessPass}
        onClose={() => setShowAccessPass(false)}
        patient={{
          id: selectedRequest?.patientId || '',
          name: selectedRequest?.patientName || 'Unknown',
          requestId: selectedRequest?.id,
          accessCode: selectedRequest?.accessCode
        }}
        facilityName={facilityInfo.name}
        facilityLogo={facilityInfo.logo}
      />
    </div>
  );
}
