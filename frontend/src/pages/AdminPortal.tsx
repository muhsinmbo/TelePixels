import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, doc, updateDoc, setDoc, serverTimestamp, collectionGroup, getDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, sanitizeDocId } from '../lib/utils';
import { Shield, Activity, Users, Building2, Search, Filter, ArrowUpRight, TrendingUp, History, UserCheck, UserX, Mail, UserCog, Layout, Plus, Pencil, X, Banknote, DollarSign, Trash2, Check, XCircle, ShieldAlert, Download, Loader2, FileText, Vote } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { logAction } from '../services/loggerService';
import { exportFullDataArchive } from '../services/bulkExportService';

import { ALL_PRICED_ITEMS } from '../constants';

interface LogEntry {
  id: string;
  action: string;
  userName: string;
  userEmail: string;
  details: string;
  timestamp: string;
  facilityId: string;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'inactive';
  facilityId: string;
  createdAt?: string;
}

interface Stats {
  totalUsers: number;
  totalPatients: number;
  totalRequests: number;
  activeStudies: number;
}

interface PriceConfig {
  partName: string;
  price?: number;
  pendingPrice?: number;
  currency: string;
  status: 'pending' | 'approved';
  updatedAt: string;
  proposedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface DeletionRequest {
  id: string;
  name: string;
  deletionRequestedBy: string;
  deletionRequestedAt: string;
  facilityId: string;
  patientId: string;
}

interface EditRequest {
  id: string;
  name: string;
  editRequestedBy: string;
  editRequestedAt: string;
  facilityId: string;
  pendingEditData: {
    patient: any;
    request: any;
    requestId: string;
  };
}

type Tab = 'audit' | 'users' | 'pricing' | 'edits' | 'surveys';

import DateFilterDropdown from '../components/DateFilterDropdown';
import FilterDropdown from '../components/FilterDropdown';

import AnimatedNumber from '../components/AnimatedNumber';

export default function AdminPortal() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(profile?.role === 'superadmin' ? 'audit' : 'pricing');
  const [logSearch, setLogSearch] = useState('');
  const [logDateFilter, setLogDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [surveyLogs, setSurveyLogs] = useState<LogEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [pricing, setPricing] = useState<PriceConfig[]>([]);
  const [globalPricingEnabled, setGlobalPricingEnabled] = useState(false);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalPatients: 0,
    totalRequests: 0,
    activeStudies: 0
  });
  const [sortField, setSortField] = useState<'date' | 'name'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priceSearch, setPriceSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ uid: string; email: string } | null>(null);
  const [customProcedure, setCustomProcedure] = useState({ name: '', price: 0 });
  const [newUser, setNewUser] = useState({
    email: '',
    role: 'receptionist',
    displayName: ''
  });

  const [globalFacilityName, setGlobalFacilityName] = useState("King's Diagnostic Imaging and Research Center");

  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.facilityName) {
          setGlobalFacilityName(data.facilityName);
        }
      }
    });
    return () => unsubGlobal();
  }, []);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, phase: '' });
  const [exportDates, setExportDates] = useState({
    start: '',
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    let unsubscribeLogs = () => {};
    let unsubscribeSurveys = () => {};
    let unsubscribeUsers = () => {};

    const isSuper = profile?.role === 'superadmin';
    const isFacility = profile?.role === 'facilityadmin';

    // 1. Listen for Logs (Super Admin & Facility Admin)
    if (isSuper || isFacility) {
      const qLogs = query(
        collection(db, 'logs'), 
        orderBy('timestamp', 'desc'), 
        limit(200)
      );

      unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
        const logData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as LogEntry[];
        setLogs(logData);
        if (!isSuper) {
          setLoading(false);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'logs');
      });

      // Specific surveys logs to bypass the 200 general log limit and avoid indexing issues
      const qSurveys = query(
        collection(db, 'logs'),
        where('action', '==', 'PORTAL_FEEDBACK')
      );

      unsubscribeSurveys = onSnapshot(qSurveys, (snapshot) => {
        const feedbackData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as LogEntry[];
        feedbackData.sort((a, b) => {
          const tA = (a.timestamp as any)?.seconds || 0;
          const tB = (b.timestamp as any)?.seconds || 0;
          return tB - tA;
        });
        setSurveyLogs(feedbackData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'logs/surveys');
      });
    }

    if (isSuper || isFacility) {
      // 2. Listen for Users (Super Admin & Facility Admin)
      unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const userData = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          return {
            ...data,
            uid: doc.id
          } as UserProfile;
        });
        setAllUsers(userData);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
    } else {
      // For other roles, stop loading immediately
      setLoading(false);
    }

    // 3. Stats
    const fetchStats = async () => {
      if (profile?.role !== 'superadmin') return;
      
      try {
        const patientsSnap = await getDocs(collection(db, 'patients'));
        const usersSnap = await getDocs(collection(db, 'users'));
        const requestsSnap = await getDocs(collectionGroup(db, 'requests'));
        
        setStats({ 
          totalUsers: usersSnap.size,
          totalPatients: patientsSnap.size,
          totalRequests: requestsSnap.size,
          activeStudies: requestsSnap.docs.filter(d => {
            const data = d.data() as any;
            return ['pending', 'in progress', 'images uploaded'].includes(data.status?.toLowerCase());
          }).length
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };

    fetchStats();

    // 4. Listen for Global Pricing Config
    const unsubscribeGlobalSettings = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalPricingEnabled(snapshot.data().allowFacilityAccess || false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/pricing');
    });

    // 5. Listen for Pricing
    const facilityId = 'default-facility';
    console.log('AdminPortal: Listening to pricing for facility:', facilityId);
    
    const qPricing = collection(db, 'facilities', facilityId, 'pricing');
    const unsubscribePricing = onSnapshot(qPricing, (snapshot) => {
      const pricingData = snapshot.docs.map(doc => doc.data() as PriceConfig);
      setPricing(pricingData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `facilities/${facilityId}/pricing`);
    });

    // 6. Listen for Edit Requests
    const qEdits = query(
      collection(db, 'patients'),
      where('editStatus', '==', 'pending'),
      where('facilityId', '==', 'default-facility')
    );
    const unsubscribeEditRequests = onSnapshot(qEdits, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EditRequest));
      setEditRequests(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'patients/edits');
    });

    return () => {
      unsubscribeLogs();
      unsubscribeSurveys();
      unsubscribeUsers();
      unsubscribePricing();
      unsubscribeEditRequests();
      unsubscribeGlobalSettings();
    };
  }, [profile?.role, profile?.facilityId]);

  const toggleGlobalPricing = async () => {
    if (profile?.role !== 'superadmin') return;
    try {
      const nextSetting = !globalPricingEnabled;
      await setDoc(doc(db, 'settings', 'pricing'), {
        allowFacilityAccess: nextSetting,
        updatedAt: serverTimestamp(),
        updatedBy: profile.uid
      }, { merge: true });
      toast.success(nextSetting ? 'Pricing module activated for all facilities' : 'Pricing module deactivated for facilities');
      logAction({
        action: 'PRICING_CONFIG_CHANGE',
        details: `${nextSetting ? 'Activated' : 'Deactivated'} facility pricing access globally`,
      });
    } catch (err) {
      toast.error('Failed to update pricing config');
    }
  };

  const handleApproveEdit = async (patientId: string, patientName: string) => {
    console.log('handleApproveEdit: Starting approval for', patientId, patientName);
    
    const editReq = editRequests.find(r => r.id === patientId);
    if (!editReq || !editReq.pendingEditData) {
      console.error('handleApproveEdit: Could not find pending edit data for', patientId);
      toast.error('Could not find pending edit data');
      return;
    }

    const { patient: newPatientData, request: newRequestData, requestId: subRequestId } = editReq.pendingEditData;
    console.log('handleApproveEdit: Extracted data:', { newPatientData, newRequestData, subRequestId });

    try {
      // 1. Update Patient
      const patientRef = doc(db, 'patients', patientId);
      
      const lastBodyParts = newRequestData?.selectedParts 
        ? newRequestData.selectedParts.map((p: any) => p.name).join(', ')
        : (editReq as any).lastBodyParts || '';

      console.log('handleApproveEdit: Updating patient doc...');
      await updateDoc(patientRef, {
        name: newPatientData.name || patientName,
        age: isNaN(Number(newPatientData.age)) ? ((editReq as any).age || 0) : Number(newPatientData.age),
        gender: newPatientData.gender || (editReq as any).gender || 'Male',
        phone: newPatientData.phone || (editReq as any).phone || '',
        address: newPatientData.address || (editReq as any).address || '',
        lastBodyParts,
        lastProcedures: newPatientData.lastProcedures || (editReq as any).lastProcedures || [],
        lastTotalCost: newPatientData.lastTotalCost || (editReq as any).lastTotalCost || 0,
        editStatus: 'none',
        pendingEditData: null,
        editRequestedBy: null,
        editRequestedAt: null,
        updatedAt: serverTimestamp()
      });

      // 2. Update Request if exists
      if (subRequestId && newRequestData) {
        console.log('handleApproveEdit: Updating request sub-doc...', subRequestId);
        const reqRef = doc(db, 'patients', patientId, 'requests', subRequestId);
        
        await updateDoc(reqRef, {
          modalities: newRequestData.modalities || [],
          selectedParts: newRequestData.selectedParts || [],
          clinicalInfo: newRequestData.clinicalInfo || '',
          priority: newRequestData.priority || 'routine',
          needsReport: newRequestData.needsReport !== undefined ? newRequestData.needsReport : true,
          procedures: newRequestData.procedures || [],
          totalCost: newRequestData.totalCost || 0,
          patientName: newRequestData.patientName || newPatientData.name || patientName,
          patientAge: isNaN(Number(newRequestData.patientAge)) ? (isNaN(Number(newPatientData.age)) ? ((editReq as any).age || 0) : Number(newPatientData.age)) : Number(newRequestData.patientAge),
          patientGender: newRequestData.patientGender || newPatientData.gender || (editReq as any).gender || 'Male',
          patientPhone: newRequestData.patientPhone || newPatientData.phone || (editReq as any).phone || '',
          patientEmail: newRequestData.patientEmail || newPatientData.email || (editReq as any).email || '',
          physicianName: newRequestData.physicianName || '',
          physicianPhone: newRequestData.physicianPhone || '',
          physicianEmail: newRequestData.physicianEmail || '',
          updatedAt: serverTimestamp()
        });
      }

      toast.success('Patient edit approved and applied successfully');
      logAction({
        action: 'PATIENT_EDIT_APPROVED',
        details: `Approved edit for patient: ${patientName} (${patientId})`,
        facilityId: 'default-facility'
      });
      console.log('handleApproveEdit: Success');
    } catch (err) {
      console.error('handleApproveEdit: Error:', err);
      toast.error('Failed to approve and apply edit. Check console for details.');
      handleFirestoreError(err, OperationType.UPDATE, `patients/${patientId}/approve`);
    }
  };

  const handleRejectEdit = async (requestId: string, patientName: string) => {
    console.log('handleRejectEdit: Starting rejection for', requestId, patientName);
    try {
      const patientRef = doc(db, 'patients', requestId);
      await updateDoc(patientRef, {
        editStatus: 'none',
        pendingEditData: null,
        editRequestedBy: null,
        editRequestedAt: null,
        updatedAt: serverTimestamp()
      });
      toast.success('Edit request rejected');
      logAction({
        action: 'PATIENT_EDIT_REJECTED',
        details: `Rejected edit for patient: ${patientName} (${requestId})`,
        facilityId: 'default-facility'
      });
      console.log('handleRejectEdit: Success');
    } catch (err) {
      console.error('handleRejectEdit: Error:', err);
      toast.error('Failed to reject edit');
      handleFirestoreError(err, OperationType.UPDATE, `patients/${requestId}/reject`);
    }
  };

  const handleUpdateRole = async (uid: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { role: newRole });
      toast.success('User role updated');
      logAction({
        action: 'USER_ROLE_CHANGE',
        details: `Changed role for user ${uid} to ${newRole}`,
        targetId: uid
      });
    } catch (err) {
      toast.error('Failed to update role');
    }
  };

  const handleToggleStatus = async (uid: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { status: newStatus });
      toast.success(`User set to ${newStatus}`);
      logAction({
        action: 'USER_ROLE_CHANGE',
        details: `Set user ${uid} status to ${newStatus}`,
        targetId: uid
      });
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const { uid, email } = userToDelete;
    try {
      const userRef = doc(db, 'users', uid);
      await deleteDoc(userRef);
      toast.success('User deleted successfully');
      logAction({
        action: 'USER_DELETE',
        details: `Deleted user ${email} (${uid})`,
        targetId: uid
      });
      setUserToDelete(null);
    } catch (err) {
      console.error('Delete user error:', err);
      toast.error('Failed to delete user');
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = newUser.email.trim();
    if (!targetEmail) {
      toast.error('Email is required');
      return;
    }

    try {
      // Check if user already exists
      const existing = allUsers.find(u => u.email && u.email.toLowerCase() === targetEmail.toLowerCase());
      if (existing) {
        toast.error(`User with email ${targetEmail} already exists`);
        return;
      }

      const tempId = targetEmail.toLowerCase();
      const userRef = doc(db, 'users', tempId);
      await setDoc(userRef, {
        ...newUser,
        email: targetEmail.toLowerCase(),
        facilityId: 'default-facility',
        facilityName: globalFacilityName,
        uid: tempId, // Temporary ID, will be linked to real UID on first login
        status: 'active',
        createdAt: serverTimestamp()
      });

      toast.success('User pre-authorized successfully');
      setShowAddModal(false);
      setNewUser({ email: '', role: 'receptionist', displayName: '' });
      
      // Log after success
      await logAction({
        action: 'USER_ROLE_CHANGE',
        details: `Pre-authorized user ${targetEmail} with role ${newUser.role}`
      });
    } catch (err: any) {
      console.error('Pre-auth error:', err);
      toast.error(`Failed to pre-authorize user: ${err.message || 'Unknown error'}`);
    }
  };

  const [priceInputs, setPriceInputs] = useState<Record<string, number>>({});

  const handleProposePrice = async (partName: string, price: number) => {
    try {
      const targetFacilityId = 'default-facility';
      const priceRef = doc(db, 'facilities', targetFacilityId, 'pricing', sanitizeDocId(partName));
      
      // Get existing doc if any to preserve active price
      const current = pricing.find(p => p.partName === partName);
      
      await setDoc(priceRef, {
        partName,
        price: current?.price || 0, // Keep current live price
        pendingPrice: Number(price),
        currency: 'GHS',
        status: 'pending',
        updatedAt: serverTimestamp(),
        proposedBy: profile?.uid
      }, { merge: true });
      
      toast.success(`Price proposal submitted for ${partName}`);
    } catch (err) {
      console.error('Propose error:', err);
      toast.error('Failed to propose price');
    }
  };

  const handleApprovePrice = async (partName: string) => {
    // Check if current user is a Super Admin
    if (profile?.role !== 'superadmin') {
      toast.error('Only Super Admins can approve price changes');
      return;
    }

    const config = pricing.find(p => p.partName === partName);
    if (!config || config.status !== 'pending' || config.pendingPrice === undefined) {
      toast.error('No pending price to approve');
      return;
    }

    try {
      const targetFacilityId = 'default-facility';
      const priceRef = doc(db, 'facilities', targetFacilityId, 'pricing', sanitizeDocId(partName));
      await updateDoc(priceRef, {
        price: config.pendingPrice,
        status: 'approved',
        approvedBy: profile?.uid,
        approvedAt: serverTimestamp()
      });
      toast.success(`Price approved for ${partName}`);
      logAction({
        action: 'PRICE_APPROVED',
        details: `Super Admin ${profile?.displayName} approved price of GHS ${config.pendingPrice} for ${partName}`,
        facilityId: 'default-facility'
      });
    } catch (err) {
      console.error('Approve error:', err);
      toast.error('Failed to approve price');
    }
  };

  const handleAddCustomProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProcedure.name) return;
    await handleProposePrice(customProcedure.name, customProcedure.price);
    setShowCustomPriceModal(false);
    setCustomProcedure({ name: '', price: 0 });
  };

  const handleExportData = async () => {
    setIsExporting(true);
    setExportProgress({ current: 0, total: 0, phase: 'Initializing...' });
    const start = exportDates.start ? new Date(exportDates.start) : undefined;
    const end = exportDates.end ? new Date(exportDates.end) : undefined;
    
    const success = await exportFullDataArchive(start, end, (progress) => {
      setExportProgress({
        current: progress.currentPatient,
        total: progress.totalPatients,
        phase: progress.phase
      });
    });

    if (success) {
      toast.success('Medical archive (CSV + Images) generated successfully');
      logAction({
        action: 'DATA_EXPORT_FULL',
        details: `Super Admin exported full medical archive (ZIP) for range ${exportDates.start || 'all'} to ${exportDates.end}`
      });
    } else {
      toast.error('Export failed: Permission denied or network error. Please check developer console for details.');
    }
    setIsExporting(false);
    setExportProgress({ current: 0, total: 0, phase: '' });
  };

  const handleDownloadSurveysCSV = () => {
    if (surveyLogs.length === 0) {
      toast.error('No survey responses to export.');
      return;
    }

    const headers = [
      'Practitioner Name',
      'Facility',
      'Synced Gmail',
      'Patient Reference',
      'Preferred Format',
      'Recommendation Score (NPS)',
      'Feedback Comments',
      'Submitted Date'
    ];

    const escapeCsvValue = (val: any) => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val).trim();
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    };

    const rows = surveyLogs.map(entry => {
      let parsed: any = {};
      try {
        parsed = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
      } catch {
        parsed = {
          preference: 'portal',
          nps: 10,
          usabilityNotes: entry.details || ''
        };
      }

      const practitionerName = parsed.practitionerName || entry.userName || 'Referring Practitioner';
      const facility = parsed.facility || (entry as any).facility || '';
      const gmail = parsed.gmail || (entry as any).gmail || '';
      const patientName = parsed.patientName || 'Unknown Patient';
      const preference = parsed.preference || '';
      const preferenceLabel = preference === 'portal' 
        ? 'Raw Digital Portal' 
        : preference === 'film' 
        ? 'Conventional Film' 
        : 'Hybrid Modality';
      const nps = parsed.nps ?? 10;
      const usabilityNotes = parsed.usabilityNotes || parsed.notes || '';
      const dateStr = formatDate(entry.timestamp);

      return [
        practitionerName,
        facility,
        gmail,
        patientName,
        preferenceLabel,
        nps,
        usabilityNotes,
        dateStr
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'practitioner_preference_surveys.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Survey responses exported successfully to CSV/Excel format!');
  };

  const filteredPricingList = Array.from(new Set([...ALL_PRICED_ITEMS, ...pricing.map(p => p.partName)]))
    .filter(part => part.toLowerCase().includes(priceSearch.toLowerCase()))
    .sort();

  const [userSortField, setUserSortField] = useState<'name' | 'role' | 'status'>('name');
  const [userSortDirection, setUserSortDirection] = useState<'asc' | 'desc'>('asc');

  const filteredUsers = allUsers.filter(u => 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    const modifier = userSortDirection === 'asc' ? 1 : -1;
    if (userSortField === 'name') {
      return (a.displayName || a.email).localeCompare(b.displayName || b.email) * modifier;
    }
    if (userSortField === 'role') {
      return (a.role || '').localeCompare(b.role || '') * modifier;
    }
    if (userSortField === 'status') {
      return (a.status || 'active').localeCompare(b.status || 'active') * modifier;
    }
    return 0;
  });

  const sortedEditRequests = [...editRequests].sort((a, b) => {
    const modifier = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'date') {
      const aRaw = (a.editRequestedAt as any)?.toDate?.() || a.editRequestedAt;
      const bRaw = (b.editRequestedAt as any)?.toDate?.() || b.editRequestedAt;
      const aTime = aRaw ? new Date(aRaw).getTime() : 0;
      const bTime = bRaw ? new Date(bRaw).getTime() : 0;
      return (aTime - bTime) * modifier;
    }
    const aName = a.name || '';
    const bName = b.name || '';
    return aName.localeCompare(bName) * modifier;
  });

  const getSortLabel = () => sortField === 'date' ? 'Time' : 'Name';

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.userName.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(logSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    if (logDateFilter === 'all') return true;
    
    const date = new Date((log.timestamp as any)?.toDate?.() || log.timestamp);
    if (isNaN(date.getTime())) return true;
    const now = new Date();
    
    if (logDateFilter === 'today') return date.toDateString() === now.toDateString();
    if (logDateFilter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      return date.toDateString() === yesterday.toDateString();
    }
    if (logDateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return date >= weekAgo;
    }
    return true;
  });

  return (
    <div className="space-y-8 w-full">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="text-primary w-6 h-6" />
            <h1 className="text-3xl font-bold tracking-tight">
              {profile?.role === 'superadmin' ? 'Super Admin Portal' : 'Facility Admin Portal'}
            </h1>
          </div>
          <p className="text-muted">
            Managing clinical workflow and system security in a unified facility environment.
          </p>
        </div>
        
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto max-w-full gap-1">
          {profile?.role === 'superadmin' && (
            <button 
              onClick={() => setActiveTab('audit')}
              title="Audit Logs"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap select-none",
                activeTab === 'audit' ? "bg-primary text-black" : "text-muted hover:text-main hover:bg-white/5"
              )}
            >
              <History className="w-4 h-4 shrink-0" />
              <span>Audit Trail</span>
            </button>
          )}
          {(profile?.role === 'superadmin' || profile?.role === 'facilityadmin') && (
            <button 
              onClick={() => setActiveTab('users')}
              title="User Management"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap select-none",
                activeTab === 'users' ? "bg-primary text-black" : "text-muted hover:text-main hover:bg-white/5"
              )}
            >
              <UserCog className="w-4 h-4 shrink-0" />
              <span>Users</span>
            </button>
          )}
          {profile?.role === 'superadmin' && (
            <div className="flex items-center gap-2 px-3 border-r border-white/10 mr-2 shrink-0">
               <button 
                onClick={toggleGlobalPricing}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border",
                  globalPricingEnabled 
                    ? "bg-success/20 text-success border-success/30" 
                    : "bg-white/5 text-muted border-white/10 hover:bg-white/10"
                )}
                title={globalPricingEnabled ? "Deactivate Facility Pricing" : "Activate Facility Pricing"}
              >
                <Activity className={cn("w-3 h-3", globalPricingEnabled && "animate-pulse")} />
                {globalPricingEnabled ? "Pricing: ACTIVE" : "Pricing: OFF"}
              </button>
            </div>
          )}
          {(profile?.role === 'superadmin' || (profile?.role === 'facilityadmin' && globalPricingEnabled)) && (
            <button 
              onClick={() => setActiveTab('pricing')}
              title="Procedure Pricing"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all relative whitespace-nowrap select-none",
                activeTab === 'pricing' ? "bg-primary text-black" : "text-muted hover:text-main hover:bg-white/5"
              )}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              <span>Pricing</span>
              {pricing.filter(p => p.status === 'pending').length > 0 && (
                <span className="w-2 h-2 bg-yellow-500 rounded-full border border-[#0a0a0a] shrink-0" />
              )}
            </button>
          )}
          {(profile?.role === 'facilityadmin' || profile?.role === 'superadmin') && (
            <button 
              onClick={() => setActiveTab('edits')}
              title="Edit Requests"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all relative whitespace-nowrap select-none",
                activeTab === 'edits' ? "bg-primary text-black" : "text-muted hover:text-main hover:bg-white/5"
              )}
            >
              <Pencil className="w-4 h-4 shrink-0" />
              <span>Edit Requests</span>
              {editRequests.length > 0 && (
                <span className="w-2 h-2 bg-primary rounded-full border border-[#0a0a0a] shrink-0" />
              )}
            </button>
          )}
          {(profile?.role === 'facilityadmin' || profile?.role === 'superadmin') && (
            <button 
              onClick={() => setActiveTab('surveys')}
              title="Practitioner Preference Surveys"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all relative whitespace-nowrap select-none",
                activeTab === 'surveys' ? "bg-primary text-black" : "text-muted hover:text-main hover:bg-white/5"
              )}
            >
              <Vote className="w-4 h-4 shrink-0" />
              <span>Clinician Surveys</span>
              {surveyLogs.length > 0 && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full border border-[#0a0a0a] shrink-0" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Super Admin Data Archive Tool - Always visible for Super Admin */}
      {profile?.role === 'superadmin' && (
        <div className="glass-panel p-6 border-primary/20 bg-primary/5 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Comprehensive Research Export</h3>
                <p className="text-sm text-muted">Generate a full clinical export (.zip) including spreadsheet data and all associated imaging studies.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <label htmlFor="export-start-date" className="text-[10px] uppercase font-bold text-muted ml-1">Range Start</label>
                <input 
                  id="export-start-date"
                  name="exportStartDate"
                  type="date" 
                  value={exportDates.start}
                  onChange={(e) => setExportDates(prev => ({ ...prev, start: e.target.value }))}
                  className="glass-input text-xs py-2"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="export-end-date" className="text-[10px] uppercase font-bold text-muted ml-1">Range End</label>
                <input 
                  id="export-end-date"
                  name="exportEndDate"
                  type="date" 
                  value={exportDates.end}
                  onChange={(e) => setExportDates(prev => ({ ...prev, end: e.target.value }))}
                  className="glass-input text-xs py-2"
                />
              </div>
              <div className="flex flex-col items-end gap-2">
                <button 
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="glass-btn bg-primary text-black font-bold h-10 w-10 mt-4 md:mt-0 flex items-center justify-center disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(var(--color-primary),0.3)]"
                  title="Download Full Archive"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </button>
                {isExporting && (
                  <p className="text-[10px] text-primary font-bold animate-pulse">
                    {exportProgress.phase || 'Working...'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-6">
        <StatCard 
          title="Total Patients" 
          value={stats.totalPatients} 
          icon={Users} 
          trend="Registered" 
        />
        <StatCard 
          title="Clinical Requests" 
          value={stats.totalRequests} 
          icon={FileText} 
          trend="All Time" 
        />
        <StatCard 
          title="Active Workflow" 
          value={stats.activeStudies} 
          icon={Activity} 
          trend="Processing" 
          color="success"
        />
        <StatCard 
          title="Total Users" 
          value={stats.totalUsers} 
          icon={Shield} 
          trend="Authorized" 
        />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'audit' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">System Audit Trail</h2>
              </div>
              <div className="flex items-center gap-3 overflow-visible">
                <DateFilterDropdown 
                  value={logDateFilter} 
                  onChange={setLogDateFilter} 
                />
                <div className="relative">
                  <label htmlFor="audit-filter" className="sr-only">Filter logs</label>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input 
                    id="audit-filter"
                    name="auditFilter"
                    type="text" 
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filter logs..."
                    className="glass-input pl-10 text-xs py-2 w-64"
                  />
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Details</th>
                      <th className="px-6 py-4 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border",
                            log.action.includes('LOGIN') ? "border-success/30 bg-success/10 text-success" :
                            log.action.includes('UPLOAD') ? "border-primary/30 bg-primary/10 text-primary" :
                            "border-white/10 bg-white/5 text-muted"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold">{log.userName}</p>
                            <p className="text-[10px] text-muted">{log.userEmail}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted max-w-md truncate">{log.details}</td>
                        <td className="px-6 py-4 text-right text-[10px] text-muted font-mono">{formatDate(log.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">User Management</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <label htmlFor="user-search" className="sr-only">Search users</label>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input 
                    id="user-search"
                    name="userSearch"
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="glass-input pl-10 text-xs py-2 w-64"
                  />
                </div>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="glass-btn bg-primary text-black font-bold flex items-center gap-2 px-4 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th 
                        className="px-6 py-4 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => {
                          if (userSortField === 'name') setUserSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                          else { setUserSortField('name'); setUserSortDirection('asc'); }
                        }}
                      >
                        Identity {userSortField === 'name' && (userSortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => {
                          if (userSortField === 'role') setUserSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                          else { setUserSortField('role'); setUserSortDirection('asc'); }
                        }}
                      >
                        Current Role {userSortField === 'role' && (userSortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="px-6 py-4 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => {
                          if (userSortField === 'status') setUserSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                          else { setUserSortField('status'); setUserSortDirection('asc'); }
                        }}
                      >
                        Status {userSortField === 'status' && (userSortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.map(user => (
                      <tr key={user.uid} className={cn("hover:bg-white/5 transition-colors group", user.status === 'inactive' && "opacity-50")}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                              {user.displayName?.[0] || user.email?.[0]}
                            </div>
                            <div>
                              <p className="font-bold">{user.displayName || 'Pending Login'}</p>
                              <div className="flex items-center gap-1 text-[10px] text-muted">
                                <Mail className="w-3 h-3" />
                                <span>{user.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <label htmlFor={`role-select-${user.uid}`} className="sr-only">Change role for {user.displayName || user.email}</label>
                          <select 
                            id={`role-select-${user.uid}`}
                            name={`roleSelect-${user.uid}`}
                            value={user.role}
                            onChange={(e) => handleUpdateRole(user.uid, e.target.value)}
                            className="bg-transparent border border-white/10 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                            disabled={user.email === 'alienwaregl01@gmail.com'}
                          >
                            <option value="superadmin" className="bg-white text-black">Super Admin</option>
                            <option value="facilityadmin" className="bg-white text-black">Facility Admin</option>
                            <option value="radiologist" className="bg-white text-black">Radiologist</option>
                            <option value="radiographer" className="bg-white text-black">Radiographer</option>
                            <option value="sonographer" className="bg-white text-black">Sonographer</option>
                            <option value="receptionist" className="bg-white text-black">Receptionist</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            user.status === 'active' ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                          )}>
                            {user.status || 'active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {(user.email !== 'alienwaregl01@gmail.com' && user.uid !== profile?.uid) && (
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => handleToggleStatus(user.uid, user.status || 'active')}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  user.status === 'inactive' ? "text-success hover:bg-success/20" : "text-danger hover:bg-danger/20"
                                )}
                                title={user.status === 'inactive' ? "Activate Account" : "Deactivate Account"}
                              >
                                {user.status === 'inactive' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                              </button>
                              
                              <button 
                                onClick={() => setUserToDelete({ uid: user.uid, email: user.email })}
                                className="p-2 rounded-lg text-danger hover:bg-danger/20 transition-all"
                                title="Delete User"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'edits' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">Pending Edit Requests</h2>
              </div>
              <div className="flex items-center gap-2 overflow-visible">
                <FilterDropdown
                  label="Sort"
                  value={sortField}
                  onChange={(val) => setSortField(val as any)}
                  icon={Filter}
                  options={[
                    { value: 'date', label: 'Time' },
                    { value: 'name', label: 'Name' }
                  ]}
                />
                <button 
                  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2.5 rounded-lg bg-white/10 border border-white/20 text-muted hover:text-main transition-all shadow-lg"
                >
                  <Filter className={cn("w-4 h-4", sortDirection === 'asc' ? "" : "transform rotate-180")} />
                </button>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Patient</th>
                      <th className="px-6 py-4">Changes Requested</th>
                      <th className="px-6 py-4">Requested By</th>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedEditRequests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted italic">
                          No pending edit requests.
                        </td>
                      </tr>
                    ) : sortedEditRequests.map(req => (
                      <tr key={req.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold text-main">{req.name}</p>
                            <p className="font-mono text-[10px] text-primary">{req.id}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[10px] space-y-2">
                             {/* Patient Info Diff */}
                             <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-2">
                                <div>
                                  <p className="text-muted font-bold mb-1 uppercase tracking-tighter">Current Info</p>
                                  <p className="text-muted">Name: <span className="text-main">{req.name}</span></p>
                                  <p className="text-muted">Age: <span className="text-main">{(req as any).age}</span></p>
                                  <p className="text-muted">Phone: <span className="text-main">{(req as any).phone || 'N/A'}</span></p>
                                </div>
                                <div>
                                  <p className="text-primary font-bold mb-1 uppercase tracking-tighter">Proposed Changes</p>
                                  <p className={cn(req.name !== req.pendingEditData?.patient?.name ? "text-primary font-medium" : "text-muted")}>
                                    Name: {req.pendingEditData?.patient?.name}
                                  </p>
                                  <p className={cn(String((req as any).age) !== String(req.pendingEditData?.patient?.age) ? "text-primary font-medium" : "text-muted")}>
                                    Age: {req.pendingEditData?.patient?.age}
                                  </p>
                                  <p className={cn((req as any).phone !== req.pendingEditData?.patient?.phone ? "text-primary font-medium" : "text-muted")}>
                                    Phone: {req.pendingEditData?.patient?.phone || 'N/A'}
                                  </p>
                                </div>
                             </div>

                             {/* Request Info Diff */}
                             <div className="grid grid-cols-2 gap-4 pt-1">
                                <div>
                                  <p className="text-muted font-bold mb-1 uppercase tracking-tighter">Current Study</p>
                                  <p className="text-muted">Part(s): <span className="text-main">{(req as any).lastBodyParts || 'None'}</span></p>
                                </div>
                                <div>
                                  <p className="text-primary font-bold mb-1 uppercase tracking-tighter">Proposed Study</p>
                                  <p className="text-primary">Part(s): {req.pendingEditData?.request?.selectedParts?.map((p: any) => p.name).join(', ') || 'None'}</p>
                                  <p className="text-muted">Modalities: <span className="text-main">{req.pendingEditData?.request?.modalities?.join(', ') || 'None'}</span></p>
                                </div>
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted">{req.editRequestedBy}</td>
                        <td className="px-6 py-4 text-xs text-muted">{formatDate(req.editRequestedAt)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {(profile?.role === 'facilityadmin' || profile?.role === 'superadmin') ? (
                              <>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApproveEdit(req.id, req.name);
                                  }}
                                  className="p-2 rounded-lg bg-primary text-black hover:bg-primary/80 transition-all flex items-center justify-center shrink-0"
                                  title="Approve & Apply Changes"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRejectEdit(req.id, req.name);
                                  }}
                                  className="p-2 rounded-lg bg-white/5 text-muted hover:text-main hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center shrink-0"
                                  title="Reject Changes"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'pricing' ? (
          <div className="space-y-6">
            {!globalPricingEnabled && profile?.role !== 'superadmin' ? (
              <div className="glass-panel py-20 text-center">
                <Banknote className="w-12 h-12 text-muted mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-bold mb-2">Pricing Module Deactivated</h3>
                <p className="text-muted max-w-md mx-auto">
                  The procedure pricing module has been deactivated by the Super Admin. 
                  Facility-level price management is currently unavailable.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-bold">Procedure Pricing Configuration</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <label htmlFor="price-search" className="sr-only">Search procedures</label>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                      <input 
                        id="price-search"
                        name="priceSearch"
                        type="text" 
                        value={priceSearch}
                        onChange={(e) => setPriceSearch(e.target.value)}
                        placeholder="Search procedures..."
                        className="glass-input pl-10 text-xs py-2 w-64"
                      />
                    </div>
                    {(profile?.role === 'superadmin' || globalPricingEnabled) && (
                      <button 
                        onClick={() => setShowCustomPriceModal(true)}
                        className="glass-btn bg-white/5 text-xs font-bold border border-white/10 px-4 py-2 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Custom Procedure
                      </button>
                    )}
                  </div>
                </div>

                {!globalPricingEnabled && profile?.role === 'superadmin' && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0" />
                    <p className="text-xs text-yellow-500 font-medium">
                      <strong>Note:</strong> Pricing is currently <strong>OFF</strong> for facilities. You can still manage templates and approved prices here, but facilities cannot see or use this module until activated.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPricingList.map(part => {
                    const config = pricing.find(p => p.partName === part);
                    const hasPending = config?.status === 'pending';
                    
                    return (
                      <div key={part} className="glass-panel p-6 flex flex-col justify-between gap-4 border-l-2 border-l-transparent hover:border-l-primary transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-main mb-1 truncate" title={part}>{part}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[10px] text-muted uppercase font-bold tracking-wider">Active: GHS {config?.price?.toFixed(2) || '0.00'}</p>
                              {hasPending && (
                                <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded text-[8px] font-bold animate-pulse">
                                  Pending Review
                                </span>
                              )}
                            </div>
                          </div>
                          <Banknote className="w-4 h-4 text-primary/40 shrink-0" />
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label htmlFor={`price-propose-${part}`} className="text-[9px] text-muted uppercase font-bold tracking-widest">
                              {profile?.role === 'facilityadmin' ? 'Propose New Price' : 'Price Proposal'}
                            </label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">GHS</span>
                                <input 
                                  id={`price-propose-${part}`}
                                  name={`pricePropose-${part}`}
                                  type="number" 
                                  value={priceInputs[part] ?? config?.pendingPrice ?? config?.price ?? 0}
                                  onChange={(e) => setPriceInputs(prev => ({ ...prev, [part]: Number(e.target.value) }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleProposePrice(part, priceInputs[part] ?? config?.pendingPrice ?? config?.price ?? 0);
                                    }
                                  }}
                                  className="glass-input pl-11 py-2 text-xs w-full font-mono focus:ring-1 focus:ring-primary"
                                  placeholder="0.00"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleProposePrice(part, priceInputs[part] ?? config?.pendingPrice ?? config?.price ?? 0)}
                                className="bg-white/5 hover:bg-white/10 px-3 rounded border border-white/10 text-[10px] font-bold transition-all"
                              >
                                Propose
                              </button>
                            </div>
                          </div>

                          {hasPending && (
                            <div className="space-y-2">
                              {profile?.role === 'superadmin' ? (
                                <button
                                  onClick={() => handleApprovePrice(part)}
                                  className="w-full py-2.5 bg-primary text-black text-[10px] font-black uppercase rounded-lg hover:bg-primary/80 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-2"
                                >
                                  <Activity className="w-3 h-3" />
                                  Commit GHS {config.pendingPrice?.toFixed(2)}
                                </button>
                              ) : (
                                <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-center">
                                  <p className="text-[9px] text-yellow-500 font-bold uppercase tracking-tight">
                                    Awaiting Super Admin Approval
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredPricingList.length === 0 && (
                    <div className="col-span-full py-20 text-center glass-panel">
                      <Banknote className="w-12 h-12 text-muted mx-auto mb-4 opacity-20" />
                      <p className="text-muted font-medium">No procedures found matching "{priceSearch}"</p>
                      <button 
                        onClick={() => setPriceSearch('')}
                        className="text-primary text-sm font-bold mt-2"
                      >
                        Clear Search
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'surveys' ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">Practitioner Preference Surveys</h2>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-xs text-muted font-bold uppercase shrink-0">
                  {surveyLogs.length} Responses Gathered
                </div>
                {surveyLogs.length > 0 && (
                  <button
                    onClick={handleDownloadSurveysCSV}
                    className="glass-btn flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-primary border border-primary/20 bg-primary/5 hover:bg-primary/20 hover:border-primary/40 rounded-lg transition-all cursor-pointer"
                    title="Export all survey responses to CSV or Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV / Excel</span>
                  </button>
                )}
              </div>
            </div>

            {/* Structured statistics */}
            {(() => {
              const feedbackLogs = surveyLogs;
              
              let prefersDigital = 0;
              let prefersFilm = 0;
              let prefersBoth = 0;
              
              let totalNps = 0;
              let countNps = 0;
              
              const items: Array<{
                practitionerName: string;
                facility: string;
                gmail: string;
                patientName: string;
                preference: string;
                nps: number;
                usabilityNotes: string;
                timestamp: any;
                id: string;
              }> = [];

              feedbackLogs.forEach(entry => {
                let parsed: any = {};
                try {
                  parsed = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
                } catch {
                  parsed = {
                    preference: 'portal',
                    nps: 10,
                    usabilityNotes: entry.details || ''
                  };
                }

                const preference = parsed.preference || '';
                if (preference === 'portal') prefersDigital++;
                else if (preference === 'film') prefersFilm++;
                else if (preference === 'both') prefersBoth++;

                if (typeof parsed.nps === 'number') {
                  totalNps += parsed.nps;
                  countNps++;
                }

                items.push({
                  id: entry.id,
                  practitionerName: parsed.practitionerName || entry.userName || 'Referring Practitioner',
                  facility: parsed.facility || (entry as any).facility || '',
                  gmail: parsed.gmail || (entry as any).gmail || '',
                  patientName: parsed.patientName || 'Unknown Patient',
                  preference: preference,
                  nps: parsed.nps ?? 10,
                  usabilityNotes: parsed.usabilityNotes || parsed.notes || '',
                  timestamp: entry.timestamp
                });
              });

              const npsAverage = countNps > 0 ? (totalNps / countNps).toFixed(1) : 'N/A';
              const totalResponses = items.length;

              return (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="glass-panel p-5 space-y-2 border-l-4 border-l-primary">
                      <span className="text-[10px] text-muted font-black uppercase tracking-wider block">Average Likelihood Score</span>
                      <div className="text-3xl font-black text-main">{npsAverage} <span className="text-xs text-muted">/ 10</span></div>
                      <p className="text-[10px] text-muted leading-tight">Net recommendation rating of digitizing plates</p>
                    </div>
                    <div className="glass-panel p-5 space-y-2 border-l-4 border-l-emerald-500">
                      <span className="text-[10px] text-muted font-black uppercase tracking-wider block">Prefers Raw Digital</span>
                      <div className="text-3xl font-black text-emerald-400">{prefersDigital} <span className="text-xs text-muted">docs</span></div>
                      <p className="text-[10px] text-muted leading-tight">
                        {totalResponses > 0 ? ((prefersDigital / totalResponses) * 100).toFixed(0) : 0}% of active survey responses
                      </p>
                    </div>
                    <div className="glass-panel p-5 space-y-2 border-l-4 border-l-amber-500">
                      <span className="text-[10px] text-muted font-black uppercase tracking-wider block">Prefers Physical Film</span>
                      <div className="text-3xl font-black text-amber-500">{prefersFilm} <span className="text-xs text-muted">docs</span></div>
                      <p className="text-[10px] text-muted leading-tight">
                        {totalResponses > 0 ? ((prefersFilm / totalResponses) * 100).toFixed(0) : 0}% of active survey responses
                      </p>
                    </div>
                    <div className="glass-panel p-5 space-y-2 border-l-4 border-l-cyan-500">
                      <span className="text-[10px] text-muted font-black uppercase tracking-wider block">Prefers Hybrid / Both</span>
                      <div className="text-3xl font-black text-cyan-400">{prefersBoth} <span className="text-xs text-muted">docs</span></div>
                      <p className="text-[10px] text-muted leading-tight">
                        {totalResponses > 0 ? ((prefersBoth / totalResponses) * 100).toFixed(0) : 0}% of active survey responses
                      </p>
                    </div>
                  </div>

                  {/* List of responses */}
                  <div className="glass-panel p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-black/10 dark:border-white/5 pb-2">
                      <h3 className="text-sm font-black uppercase tracking-wider text-muted">Clinical Feedback Logs</h3>
                      {items.length > 0 && (
                        <button
                          onClick={handleDownloadSurveysCSV}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-bold uppercase tracking-wider cursor-pointer"
                          title="Download as CSV or Excel"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export Excel / CSV</span>
                        </button>
                      )}
                    </div>
                    
                    {items.length === 0 ? (
                      <div className="py-12 text-center text-muted">
                        <Vote className="w-12 h-12 text-muted mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-semibold">No practitioners have submitted preference surveys yet.</p>
                        <p className="text-xs text-muted mt-1 font-medium">Once referring docs provide feedback in the clinician portal, they will appear dynamically here.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-black/20 dark:bg-white/[0.02] border-b border-black/10 dark:border-white/10">
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted">Practitioner</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted">Patient Reference</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted">Preferred Format</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted text-center">Rating</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted">Feedback Comments</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-muted text-right">Submitted Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {items.map((item, index) => (
                              <tr 
                                key={item.id || index} 
                                className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors"
                              >
                                {/* Practitioner */}
                                <td className="px-4 py-3.5 align-middle">
                                  <div className="flex flex-col gap-1 max-w-[200px]">
                                    <span className="text-xs font-black text-main truncate" title={item.practitionerName}>{item.practitionerName}</span>
                                    <div className="flex flex-wrap gap-1">
                                      {item.facility && (
                                        <span className="text-[9px] text-primary font-bold bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 flex items-center gap-1">
                                          <Building2 className="w-3 h-3 text-primary shrink-0" />
                                          <span>{item.facility}</span>
                                        </span>
                                      )}
                                      {item.gmail && (
                                        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                          <Mail className="w-3 h-3 text-emerald-500 shrink-0" />
                                          <span>{item.gmail}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Patient Reference */}
                                <td className="px-4 py-3.5 align-middle">
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    {item.patientName}
                                  </span>
                                </td>

                                {/* Preferred Format */}
                                <td className="px-4 py-3.5 align-middle">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-block",
                                    item.preference === 'portal'
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                      : item.preference === 'film'
                                      ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                                      : "bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400"
                                  )}>
                                    {item.preference === 'portal' ? 'Raw Digital Portal' : item.preference === 'film' ? 'Conventional Film' : 'Hybrid Modality'}
                                  </span>
                                </td>

                                {/* Recommendation Rating */}
                                <td className="px-4 py-3.5 align-middle text-center">
                                  <span className="inline-flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-0.5 text-xs font-black text-primary">
                                    {item.nps} <span className="text-[9px] text-slate-500 dark:text-slate-400">/10</span>
                                  </span>
                                </td>

                                {/* Feedback Comments */}
                                <td className="px-4 py-3.5 align-middle max-w-[300px]">
                                  {item.usabilityNotes ? (
                                    <p className="text-xs text-slate-700 dark:text-slate-300 italic truncate" title={item.usabilityNotes}>
                                      "{item.usabilityNotes}"
                                    </p>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">No comments</span>
                                  )}
                                </td>

                                {/* Submitted Date */}
                                <td className="px-4 py-3.5 align-middle text-right text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                                  {formatDate(item.timestamp)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>

      {/* Add Custom Price Modal */}
      {showCustomPriceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCustomPriceModal(false)} />
          <div className="glass-panel w-full max-w-md p-8 relative z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">New Procedure</h2>
              </div>
              <button onClick={() => setShowCustomPriceModal(false)} className="text-muted hover:text-main">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomProcedure} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="custom-procedure-name" className="text-xs font-bold text-muted uppercase tracking-wider">Procedure Name</label>
                <input 
                  id="custom-procedure-name"
                  name="customProcedureName"
                  type="text" 
                  required
                  value={customProcedure.name}
                  onChange={e => setCustomProcedure(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Bone Density Scan"
                  className="glass-input w-full"
                />
                <p className="text-[10px] text-muted italic">This will add a new entry to the pricing list.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-procedure-price" className="text-xs font-bold text-muted uppercase tracking-wider">Initial Price (GHS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted">GHS</span>
                  <input 
                    id="custom-procedure-price"
                    name="customProcedurePrice"
                    type="number" 
                    required
                    value={customProcedure.price}
                    onChange={e => setCustomProcedure(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="glass-input w-full pl-12"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowCustomPriceModal(false)}
                  className="glass-btn flex-1 py-3"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="glass-btn bg-primary text-black font-bold flex-1 py-3 hover:bg-primary/80"
                >
                  Add Procedure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="glass-panel w-full max-w-md p-8 relative z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Authorize New User</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-main">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="user-email" className="text-xs font-bold text-muted uppercase tracking-wider">Email Address</label>
                <input 
                  id="user-email"
                  name="email"
                  type="email" 
                  required
                  value={newUser.email}
                  onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="staff@hospital.com"
                  className="glass-input w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-display-name" className="text-xs font-bold text-muted uppercase tracking-wider">Display Name (Optional)</label>
                <input 
                  id="user-display-name"
                  name="displayName"
                  type="text" 
                  value={newUser.displayName}
                  onChange={e => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="John Doe"
                  className="glass-input w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-role" className="text-xs font-bold text-muted uppercase tracking-wider">Assign Role</label>
                <select 
                  id="user-role"
                  name="role"
                  value={newUser.role}
                  onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  className="glass-input w-full"
                >
                  <option value="superadmin" className="bg-white text-black">Super Admin</option>
                  <option value="facilityadmin" className="bg-white text-black">Facility Admin</option>
                  <option value="radiologist" className="bg-white text-black">Radiologist</option>
                  <option value="radiographer" className="bg-white text-black">Radiographer</option>
                  <option value="sonographer" className="bg-white text-black">Sonographer</option>
                  <option value="receptionist" className="bg-white text-black">Receptionist</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="glass-btn flex-1 py-3"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="glass-btn bg-primary text-black font-bold flex-1 py-3 hover:bg-primary/80"
                >
                  Authorize User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUserToDelete(null)} />
          <div className="glass-panel w-full max-w-md p-8 relative z-10 animate-in fade-in zoom-in duration-200 border-t-2 border-t-danger">
            <div className="flex items-center gap-3 text-danger mb-4">
              <ShieldAlert className="w-6 h-6" />
              <h2 className="text-xl font-bold">Delete User Account?</h2>
            </div>
            
            <p className="text-sm text-muted mb-6">
              Are you sure you want to permanently delete user with email <span className="font-bold text-main">{userToDelete.email}</span>? This action cannot be undone and will immediately revoke all access.
            </p>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setUserToDelete(null)}
                className="glass-btn flex-1 py-3"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={confirmDeleteUser}
                className="glass-btn bg-danger text-white font-bold flex-1 py-3 hover:bg-danger/80"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color = 'primary' }: any) {
  return (
    <div className="glass-panel p-6 relative overflow-hidden group border-t-2 border-t-transparent hover:border-t-primary transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg bg-white/5", `text-${color}`)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{trend}</span>
      </div>
      <p className="text-2xl font-bold mb-1 tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      <p className="text-xs text-muted font-medium">{title}</p>
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all duration-500" />
    </div>
  );
}

function HealthGauge({ label, progress }: { label: string, progress: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] uppercase font-bold">
        <span className="text-muted">{label}</span>
        <span className="text-primary">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
        <div 
          className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] transition-all duration-1000" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
