import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, cn, formatGhanaPhoneNumber } from '../lib/utils';
import { Search, User, ChevronRight, Printer, Pencil, Trash2, ShieldAlert, QrCode, FileText, Upload, UserPlus } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { logAction } from '../services/loggerService';
import { Link } from 'react-router-dom';
import ReceiptModal from '../components/ReceiptModal';
import AccessPassModal from '../components/AccessPassModal';

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  lastBodyParts?: string;
  lastLaterality?: string;
  lastProcedures?: any[];
  lastTotalCost?: number;
  lastRequestId?: string;
  lastAccessCode?: string;
  createdAt: string;
  facilityId: string;
  editStatus?: 'pending' | 'none';
}

import DateFilterDropdown from '../components/DateFilterDropdown';
import FilterDropdown from '../components/FilterDropdown';

export default function PatientList() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_edit'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('today');
  const [sortConfig, setSortConfig] = useState<{ field: keyof Patient; direction: 'asc' | 'desc' }>({ field: 'createdAt', direction: 'desc' });
  const [loading, setLoading] = useState(true);
  const [selectedPatientForReceipt, setSelectedPatientForReceipt] = useState<Patient | null>(null);
  const [selectedPatientForPass, setSelectedPatientForPass] = useState<Patient | null>(null);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'patients'), where('facilityId', '==', 'default-facility'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Patient);
      setPatients(data);
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
  }, [profile]);

  const filteredPatients = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'pending_edit' && p.editStatus === 'pending');

    const matchesDate = () => {
      if (dateFilter === 'all') return true;
      
      // Robust date parsing for both ISO strings and Firestore Timestamps
      let createdAtDate: Date;
      const rawDate = p.createdAt as any;
      
      if (rawDate && typeof rawDate.toDate === 'function') {
        createdAtDate = rawDate.toDate();
      } else {
        createdAtDate = new Date(rawDate);
      }

      if (isNaN(createdAtDate.getTime())) return false;

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

    return matchesSearch && matchesStatus && matchesDate();
  });

  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const { field, direction } = sortConfig;
    const modifier = direction === 'asc' ? 1 : -1;
    
    // Date sorting
    if (field === 'createdAt') {
      const getVal = (val: any) => {
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        return new Date(val).getTime();
      };
      return (getVal(a[field]) - getVal(b[field])) * modifier;
    }

    // String sorting
    const aVal = String(a[field]).toLowerCase();
    const bVal = String(b[field]).toLowerCase();
    if (aVal < bVal) return -1 * modifier;
    if (aVal > bVal) return 1 * modifier;
    return 0;
  });

  const toggleSort = (field: keyof Patient) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ field }: { field: keyof Patient }) => {
    if (sortConfig.field !== field) return null;
    return (
      <span className="ml-1 text-primary">
        {sortConfig.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold">Patient List</h1>
          <p className="text-muted text-sm">Manage and view all registered patients.</p>
        </div>
        {(profile?.role === 'receptionist' || profile?.role === 'facilityadmin' || profile?.role === 'superadmin') && (
          <Link to="/intake" className="glass-btn bg-primary text-black font-bold whitespace-nowrap p-2.5" title="Register Patient">
            <UserPlus size={20} />
          </Link>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="glass-panel p-3 flex items-center gap-3 flex-1">
          <Search className="text-muted w-5 h-5 ml-1" />
          <input 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by name or ID..."
            className="bg-transparent border-none focus:outline-none flex-1 text-main text-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-visible pb-2 lg:pb-0">
          <FilterDropdown
            label="Type"
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as any)}
            icon={ShieldAlert}
            options={[
              { value: 'all', label: 'All Patients' },
              { value: 'pending_edit', label: 'Pending Edits' }
            ]}
          />

          <DateFilterDropdown 
            value={dateFilter} 
            onChange={setDateFilter} 
          />
        </div>
      </div>
    
      <div className="glass-panel overflow-x-auto">
        <table className="w-full text-left min-w-[700px] lg:min-w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th 
                className="px-6 py-4 text-sm font-medium text-muted hidden md:table-cell cursor-pointer hover:text-main transition-colors"
                onClick={() => toggleSort('id')}
              >
                Patient ID <SortIcon field="id" />
              </th>
              <th 
                className="px-6 py-4 text-sm font-medium text-muted cursor-pointer hover:text-main transition-colors"
                onClick={() => toggleSort('name')}
              >
                Name <SortIcon field="name" />
              </th>
              <th className="px-6 py-4 text-sm font-medium text-muted hidden sm:table-cell">Age / Gender</th>
              <th className="px-6 py-4 text-sm font-medium text-muted hidden lg:table-cell">Phone</th>
              <th 
                className="px-6 py-4 text-sm font-medium text-muted hidden md:table-cell cursor-pointer hover:text-main transition-colors"
                onClick={() => toggleSort('createdAt')}
              >
                Registered <SortIcon field="createdAt" />
              </th>
              <th className="px-6 py-4 text-sm font-medium text-muted text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">Loading patients...</td></tr>
            ) : sortedPatients.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-muted">No patients found</td></tr>
            ) : sortedPatients.map(patient => (
              <tr key={patient.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4 font-mono text-primary text-sm hidden md:table-cell">{patient.id}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted" />
                    </div>
                    <div>
                      <span className="font-medium block">{patient.name}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[10px] text-muted md:hidden">{patient.id}</span>
                        {patient.lastProcedures && patient.lastProcedures.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {patient.lastProcedures.map((p, idx) => (
                              <span key={idx} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap">
                                {typeof p === 'string' ? p : (p.name || p.partName)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm hidden sm:table-cell">{patient.age} / {patient.gender}</td>
                <td className="px-6 py-4 text-sm text-muted hidden lg:table-cell">
                  {patient.phone ? formatGhanaPhoneNumber(patient.phone) : 'N/A'}
                </td>
                <td className="px-6 py-4 text-sm text-muted hidden md:table-cell">{formatDate(patient.createdAt)}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-sm">
                     {(profile?.role === 'radiographer' || profile?.role === 'sonographer' || profile?.role === 'radiologist') && patient.lastAccessCode && (
                       <button 
                         onClick={() => setSelectedPatientForPass(patient)}
                         className="glass-btn p-1.5 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 flex items-center justify-center"
                         title="Print Access Pass"
                       >
                         <QrCode className="w-4 h-4" />
                       </button>
                     )}
                     {profile?.role === 'radiologist' && (
                       <Link 
                         to="/reporting" 
                         className="glass-btn p-1.5 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 flex items-center justify-center"
                         title="Submit Report"
                       >
                         <FileText className="w-4 h-4" />
                       </Link>
                     )}
                     {(profile?.role === 'radiographer' || profile?.role === 'sonographer') && (
                       <Link 
                         to="/pending" 
                         className="glass-btn p-1.5 bg-accent/20 text-accent border-accent/30 hover:bg-accent/30 flex items-center justify-center"
                         title="Upload Studies"
                       >
                         <Upload className="w-4 h-4" />
                       </Link>
                     )}
                    {(profile?.role === 'receptionist' || profile?.role === 'facilityadmin' || profile?.role === 'superadmin') && (
                      <div className="flex items-center justify-end gap-2 text-sm">
                        {patient.editStatus === 'pending' ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20 italic">
                            <ShieldAlert className="w-3 h-3" />
                            Pending Edit
                          </div>
                        ) : (
                          <>
                            <Link 
                              to={`/edit-patient/${patient.id}`}
                              className="glass-btn p-1.5 bg-white/5 text-muted hover:text-main border-white/10 flex items-center justify-center"
                              title="Edit Patient"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                            <Link 
                              to={`/finalized?search=${patient.name}`}
                              className="glass-btn p-1.5 bg-success/10 text-success border-success/30 hover:bg-success/20 flex items-center justify-center"
                              title="Finalized Reports"
                            >
                              <FileText className="w-4 h-4" />
                            </Link>
                            <button 
                              onClick={() => setSelectedPatientForReceipt(patient)}
                              className="glass-btn p-1.5 bg-white/5 text-muted hover:text-main border-white/10 flex items-center justify-center"
                              title="Print Receipt"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {patient.lastAccessCode && (
                              <button 
                                onClick={() => setSelectedPatientForPass(patient)}
                                className="glass-btn p-1.5 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 flex items-center justify-center"
                                title="Print Access Pass"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <button className="p-2 hover:bg-white/10 rounded-lg text-muted transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPatientForReceipt && (
        <ReceiptModal 
          isOpen={!!selectedPatientForReceipt}
          onClose={() => setSelectedPatientForReceipt(null)}
          patient={{
            ...selectedPatientForReceipt,
            bodyParts: selectedPatientForReceipt.lastBodyParts,
            laterality: selectedPatientForReceipt.lastLaterality,
            procedures: selectedPatientForReceipt.lastProcedures,
            totalCost: selectedPatientForReceipt.lastTotalCost
          }}
          facilityName={facilityInfo.name}
          facilityLogo={facilityInfo.logo}
        />
      )}

      {selectedPatientForPass && (
        <AccessPassModal 
          isOpen={!!selectedPatientForPass}
          onClose={() => setSelectedPatientForPass(null)}
          patient={{
            id: selectedPatientForPass.id,
            name: selectedPatientForPass.name,
            requestId: selectedPatientForPass.lastRequestId,
            accessCode: selectedPatientForPass.lastAccessCode
          }}
          facilityName={facilityInfo.name}
          facilityLogo={facilityInfo.logo}
        />
      )}
    </div>
  );
}
