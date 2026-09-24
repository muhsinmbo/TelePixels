import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, getDocs, collectionGroup, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'motion/react';
import { Users, Clock, CheckCircle, AlertCircle, FileText, MessageCircle, UserPlus, Upload, ShieldCheck, Activity, BarChart3, ListFilter, Monitor, DollarSign, Printer } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../firebase';
import NotificationCenter from '../components/NotificationCenter';

interface QuickAction {
  label: string;
  href: string;
  icon: any;
  color: string;
}

import DateFilterDropdown, { DateFilterValue } from '../components/DateFilterDropdown';

import AnimatedNumber from '../components/AnimatedNumber';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('today');
  const getModalityClass = (modality: string) => {
    if (!modality) return "bg-white/5 text-muted border-white/5";
    const norm = modality.trim().toLowerCase();
    if (norm === 'x-ray' || norm === 'xray' || norm === 'xr') {
      return "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20";
    }
    if (norm === 'mammography' || norm === 'mg' || norm === 'mammo') {
      return "bg-rose-500/15 text-rose-400 border border-rose-500/20";
    }
    if (norm === 'ultrasound' || norm === 'us') {
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
    }
    return "bg-slate-500/15 text-slate-400 border border-slate-500/20";
  };
  const [stats, setStats] = useState({
    totalPatients: 0,
    registeredToday: 0,
    pendingStudies: 0,
    completedToday: 0,
    totalCompleted: 0,
    urgentStudies: 0,
    revenueToday: 0,
    ultrasoundsCreatedToday: 0
  });

  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    const getFilterRange = () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      if (dateFilter === 'yesterday') {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
      } else if (dateFilter === 'week') {
        start.setDate(start.getDate() - 7);
      } else if (dateFilter === 'all') {
        start.setFullYear(2020); // Far enough
      }
      return { start, end };
    };

    const { start: filterStart, end: filterEnd } = getFilterRange();

    // 1. Patients Stats
    const patientsBaseQuery = query(collection(db, 'patients'), where('facilityId', '==', 'default-facility'));

    const unsubscribePatients = onSnapshot(patientsBaseQuery, (snapshot) => {
      let total = snapshot.size;
      let rangeCount = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.createdAt) {
          const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          if (createdAt >= filterStart && createdAt <= filterEnd) {
            rangeCount++;
          }
        }
      });

      setStats(prev => ({ 
        ...prev, 
        totalPatients: total,
        registeredToday: rangeCount
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'patients');
    });

    // 2. Requests Stats & Activity
    const qRequests = query(
      collectionGroup(db, 'requests'), 
      where('facilityId', '==', 'default-facility'), 
      orderBy('createdAt', 'desc')
    );

    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      let pending = 0;
      let completedInRange = 0;
      let totalCompletedCount = 0;
      let urgentCount = 0;
      let revenueInRangeCount = 0;
      const uniqueUltrasoundPatients = new Set<string>();
      const activity: any[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const modalities = data.modalities || [];

        const isUltrasound = modalities.some((m: string) => {
          const norm = m.trim().toLowerCase();
          return norm === 'ultrasound' || norm === 'us';
        });

        let inRange = false;
        if (data.createdAt) {
          const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          inRange = createdAt >= filterStart && createdAt <= filterEnd;
        }

        if (isUltrasound && inRange) {
          const patientIdKey = data.patientId || data.patientName || doc.id;
          if (patientIdKey) {
            uniqueUltrasoundPatients.add(patientIdKey);
          }
        }

        // If the user's role is sonographer, ignore non-ultrasound requests
        if (profile?.role === 'sonographer') {
          if (!isUltrasound) return;
        }

        const status = (data.status || '').toLowerCase();
        const priority = (data.priority || '').toLowerCase();
        const hasAnyNeedsReportProc = !!(data.procedures && Array.isArray(data.procedures) && data.procedures.some((p: any) => p.needsReport));
        const needsReport = data.needsReport !== false || hasAnyNeedsReportProc;
        const totalCost = data.totalCost || 0;

        if (inRange) {
          revenueInRangeCount += totalCost;
        }

        // Role-specific stats calculations
        let isCountedAsCompleted = false;
        let isCurrentlyPending = false;

        if (profile?.role === 'sonographer') {
          const isSonographerDone = data.sonographerStatus === 'Completed' || data.sonographerWorksheetStatus === 'Completed';
          if (isSonographerDone) {
            isCountedAsCompleted = true;
          } else {
            isCurrentlyPending = true;
          }
        } else if (profile?.role === 'radiologist') {
          const isRadiologistDone = data.radiologistStatus === 'Completed' || status === 'completed' || status === 'finalized';
          if (isRadiologistDone) {
            isCountedAsCompleted = true;
          } else if (needsReport) {
            isCurrentlyPending = true;
          }
        } else {
          const isOverallCompleted = status === 'completed' || status === 'finalized';
          if (isOverallCompleted) {
            isCountedAsCompleted = true;
          } else {
            isCurrentlyPending = true;
          }
        }

        if (isCountedAsCompleted) {
          totalCompletedCount++;
          if (inRange) completedInRange++;
        } else if (isCurrentlyPending) {
          pending++;
        }

        // Urgent counting
        if (priority === 'urgent' || priority === 'stat') {
          if (!isCountedAsCompleted) {
            urgentCount++;
          }
        }

        // Recent Activity (Top 5 for UI) - show active/pending studies for current role
        let isActiveForRole = isCurrentlyPending;

        if (isActiveForRole && activity.length < 5) {
          activity.push({
            id: doc.id,
            patientName: data.patientName || 'Unknown Patient',
            patientId: data.patientId,
            modality: data.modality || (data.modalities && data.modalities[0]),
            procedures: data.procedures,
            status: data.status,
            priority: data.priority,
            createdAt: data.createdAt,
          });
        }
      });

      setStats(prev => ({
        ...prev,
        pendingStudies: pending,
        completedToday: completedInRange,
        totalCompleted: totalCompletedCount,
        urgentStudies: urgentCount,
        revenueToday: revenueInRangeCount,
        ultrasoundsCreatedToday: uniqueUltrasoundPatients.size
      }));
      setRecentActivity(activity);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'requests-group');
    });

    return () => {
      unsubscribePatients();
      unsubscribeRequests();
    };
  }, [profile, dateFilter]);

  const getCards = () => {
    const periodLabel = dateFilter === 'today' ? 'Today' : dateFilter === 'yesterday' ? 'Yesterday' : dateFilter === 'week' ? 'Last 7 Days' : 'All Time';
    
    switch (profile?.role) {
      case 'receptionist':
        return [
          { label: `${periodLabel}\'s Registrations`, value: stats.registeredToday, icon: Users, color: 'text-primary' },
          { label: `${periodLabel}\'s Revenue`, value: `GHS ${stats.revenueToday.toLocaleString()}`, icon: DollarSign, color: 'text-success' },
          { label: `${periodLabel}\'s Completion`, value: stats.completedToday, icon: CheckCircle, color: 'text-success' },
        ];
      case 'facilityadmin':
      case 'superadmin':
        return [
          { label: `Revenue ${periodLabel}`, value: `GHS ${stats.revenueToday.toLocaleString()}`, icon: DollarSign, color: 'text-success' },
          { label: 'Active Pipeline', value: stats.pendingStudies, icon: Clock, color: 'text-accent' },
          { label: `${periodLabel} Output`, value: stats.completedToday, icon: CheckCircle, color: 'text-success' },
          { label: 'Critical Cases', value: stats.urgentStudies, icon: AlertCircle, color: 'text-danger' },
        ];
      case 'radiographer':
        return [
          { label: 'Imaging Queue', value: stats.pendingStudies, icon: Upload, color: 'text-accent' },
          { label: `Studies Created ${periodLabel}`, value: stats.registeredToday, icon: CheckCircle, color: 'text-success' },
          { label: 'STAT Alerts', value: stats.urgentStudies, icon: AlertCircle, color: 'text-danger' },
        ];
      case 'sonographer':
        return [
          { label: 'Ultrasound Queue', value: stats.pendingStudies, icon: Upload, color: 'text-accent' },
          { label: `Ultrasounds Created ${periodLabel}`, value: stats.ultrasoundsCreatedToday, icon: CheckCircle, color: 'text-success' },
          { label: 'Ultrasound STAT Alerts', value: stats.urgentStudies, icon: AlertCircle, color: 'text-danger' },
        ];
      case 'radiologist':
        return [
          { label: 'Pending Reports', value: stats.pendingStudies, icon: FileText, color: 'text-accent' },
          { label: `Finalized ${periodLabel}`, value: stats.completedToday, icon: CheckCircle, color: 'text-success' },
          { label: 'Urgent Cases', value: stats.urgentStudies, icon: AlertCircle, color: 'text-danger' },
        ];
      default:
        return [
          { label: `${periodLabel} Volume`, value: stats.registeredToday, icon: Activity, color: 'text-primary' },
          { label: 'Active Pipeline', value: stats.pendingStudies, icon: Clock, color: 'text-accent' },
          { label: `${periodLabel} Output`, value: stats.completedToday, icon: CheckCircle, color: 'text-success' },
          { label: 'Critical Cases', value: stats.urgentStudies, icon: AlertCircle, color: 'text-danger' },
        ];
    }
  };


  const getQuickActions = (): QuickAction[] => {
    switch (profile?.role) {
      case 'receptionist':
        return [
          { label: 'Register Patient', href: '/intake', icon: UserPlus, color: 'bg-primary' },
          { label: 'Finalized Reports', href: '/finalized', icon: Printer, color: 'bg-success' },
          { label: 'Patient List', href: '/patients', icon: ListFilter, color: 'bg-accent' },
        ];
      case 'radiographer':
      case 'sonographer':
        return [
          { label: 'Upload Study', href: '/pending', icon: Upload, color: 'bg-accent' },
          { label: 'Worklist', href: '/patients', icon: ListFilter, color: 'bg-primary' },
        ];
      case 'radiologist':
        return [
          { label: 'Reporting', href: '/reporting', icon: FileText, color: 'bg-primary' },
          { label: 'DICOM Viewer', href: '/viewer', icon: Monitor, color: 'bg-accent' },
        ];
      case 'facilityadmin':
      case 'superadmin':
        return [
          { label: 'Manage Staff', href: '/admin', icon: ShieldCheck, color: 'bg-primary' },
          { label: 'System Analytics', href: '/analytics', icon: BarChart3, color: 'bg-accent' },
        ];
      default:
        return [];
    }
  };

  const cards = getCards();
  const quickActions = getQuickActions();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 overflow-visible">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-muted mt-1 uppercase text-xs font-bold tracking-widest text-primary flex items-center gap-2">
            {profile?.facilityName || 'Teleradiology System'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 overflow-visible relative z-50">
          <DateFilterDropdown 
            value={dateFilter} 
            onChange={setDateFilter} 
          />
          
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-4 border-l border-white/10">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  to={action.href}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl text-black shadow-lg transition-all hover:scale-110 active:scale-95",
                    action.color
                  )}
                  title={action.label}
                >
                  <action.icon className="w-5 h-5" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel p-6 group hover:border-primary/40 transition-all cursor-default relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2.5 rounded-xl bg-white/5", card.color)}>
                <card.icon className="w-5 h-5" />
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
            </div>
            <div>
              <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">{card.label}</p>
              <p className="text-4xl font-bold tracking-tighter">
                {typeof card.value === 'number' ? (
                  <AnimatedNumber value={card.value} />
                ) : card.value.toString().startsWith('GHS') ? (
                  <AnimatedNumber 
                    value={card.value.toString().replace('GHS ', '').replace(',', '')} 
                    prefix="GHS " 
                  />
                ) : (
                  card.value
                )}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {(profile?.role === 'receptionist' || profile?.role === 'superadmin') && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <NotificationCenter />
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <div className="glass-panel p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold">
                  {profile?.role === 'radiologist' ? 'Studies for Interpretation' : 
                   profile?.role === 'radiographer' ? 'Pending Uploads' : 
                   profile?.role === 'sonographer' ? 'Pending Ultrasound Queue' :
                   'High Priority Activity'}
                </h2>
                <p className="text-xs text-muted mt-1">Real-time status of current facility workflow</p>
              </div>
              <button 
                onClick={() => navigate(
                  profile?.role === 'radiologist' ? '/reporting' : 
                  (profile?.role === 'radiographer' || profile?.role === 'sonographer') ? '/pending' : '/patients'
                )}
                className="text-xs font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all"
              >
                Full Worklist
              </button>
            </div>
            
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <Activity className="w-8 h-8 text-muted mx-auto mb-3 opacity-20" />
                  <p className="text-sm text-muted font-medium">No active studies in the pipeline yet.</p>
                </div>
              ) : (
                recentActivity.map((act) => (
                  <div 
                    key={act.id} 
                    onClick={() => {
                      if (profile?.role === 'sonographer') {
                        navigate(`/ultrasound-report/${act.patientId || 'N/A'}/${act.id}`);
                      } else if (profile?.role === 'radiographer') {
                        navigate(`/upload/${act.patientId || 'N/A'}/${act.id}`);
                      } else {
                        navigate(`/reporting?requestId=${act.id}`);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all cursor-pointer group",
                      act.priority?.toLowerCase() === 'urgent' ? "shadow-[inset_4px_0_0_0_#ef4444]" : "shadow-[inset_4px_0_0_0_var(--primary)]"
                    )}
                  >
                    <div className={cn(
                      "p-2.5 rounded-lg",
                      act.priority?.toLowerCase() === 'urgent' ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
                    )}>
                      {act.priority?.toLowerCase() === 'urgent' ? (
                        <AlertCircle className="w-5 h-5 animate-pulse" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{act.patientName}</p>
                        <div className="flex items-center gap-1.5 shrink-0 max-w-[200px]">
                          {act.procedures && act.procedures.length > 0 && (
                            <span className="text-[9px] text-muted truncate max-w-[100px] uppercase font-bold" title={act.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName)).join(', ')}>
                              {act.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName)).join(', ')}
                            </span>
                          )}
                          <span className={cn("text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider", getModalityClass(act.modality))}>
                            {act.modality || 'Study'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold uppercase text-primary/80">{act.status}</span>
                        <span className="text-muted text-[10px]">•</span>
                        <span className="text-muted text-[10px]">{act.createdAt ? formatDate(act.createdAt) : 'Just now'}</span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass-panel p-8">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Facility Insights</h2>
            </div>
            
            <div className="space-y-8">
              <div>
                <div className="flex justify-between mb-3 text-xs font-bold uppercase tracking-wider">
                  <span className="text-muted">Total Efficiency</span>
                  <span className="text-primary">{stats.totalPatients > 0 ? Math.round((stats.totalCompleted / (stats.pendingStudies + stats.totalCompleted || 1)) * 100) : 0}%</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/10 p-[1px]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.totalPatients > 0 ? Math.round((stats.totalCompleted / (stats.pendingStudies + stats.totalCompleted || 1)) * 100) : 0}%` }}
                    className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]" 
                  />
                </div>
                <p className="text-[10px] text-muted mt-2">Percentage of cases closed vs pending in system.</p>
              </div>

              <div>
                <div className="flex justify-between mb-3 text-xs font-bold uppercase tracking-wider">
                  <span className="text-muted">Urgent Workload</span>
                  <span className="text-danger">{stats.pendingStudies > 0 ? Math.round((stats.urgentStudies / stats.pendingStudies) * 100) : 0}%</span>
                </div>
                <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-white/10 p-[1px]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.pendingStudies > 0 ? Math.round((stats.urgentStudies / stats.pendingStudies) * 100) : 0}%` }}
                    className="h-full bg-gradient-to-r from-danger/60 to-danger rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(239,68,68,0.4)]" 
                  />
                </div>
                <p className="text-[10px] text-muted mt-2">Critical cases currently needing immediate attention.</p>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Activity className="w-4 h-4 text-primary" />
                    </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Intake Completed</p>
                    <p className="text-lg font-bold">
                      +<AnimatedNumber value={stats.completedToday} />
                    </p>
                  </div>
                  </div>
                  <div className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded">
                    Today
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-8 bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Security Compliance
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              System operating under full HIPAA-compliant encryption. All imaging data is strictly siloed and logged via the immutable audit trail.
            </p>
            <div className="mt-6 flex gap-2">
              <div className="flex-1 h-1 rounded-full bg-success/20">
                <div className="w-full h-full bg-success rounded-full" />
              </div>
              <div className="flex-1 h-1 rounded-full bg-success/20">
                <div className="w-full h-full bg-success rounded-full" />
              </div>
              <div className="flex-1 h-1 rounded-full bg-success/20">
                <div className="w-full h-full bg-success rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
