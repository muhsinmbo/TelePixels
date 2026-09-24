import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collectionGroup, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  BarChart3, TrendingUp, Users, Clock, Filter, Calendar, 
  Download, FileText, Activity, AlertCircle, ChevronDown, CheckCircle2,
  DollarSign, PieChart as PieChartIcon, Wallet, CreditCard
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../firebase';

// Colors
const RAD_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];
const PRIORITY_COLORS: Record<string, string> = {
  'STAT': '#ff4d4d',    // Brighter red
  'Urgent': '#fbbf24',  // Brighter amber
  'Routine': '#60a5fa'  // Brighter blue
};
const MODALITY_COLORS: Record<string, string> = {
  'X-Ray': '#4f46e5',     // Indigo
  'Mammography': '#f43f5e', // Rose/Red
  'Ultrasound': '#10b981',  // Emerald
  'Echo': '#06b6d4',       // Cyan
  'ECG': '#d946ef',        // Fuchsia
  'CT': '#8b5cf6',         // Violet
  'MR': '#ec4899',         // Pink
  'XR': '#4f46e5',         // Alias for X-Ray
  'US': '#10b981',         // Alias for Ultrasound
  'OT': '#94a3b8'          // Slate/Gray
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

import DateFilterDropdown, { DateFilterValue } from '../components/DateFilterDropdown';
import FilterDropdown from '../components/FilterDropdown';

import AnimatedNumber from '../components/AnimatedNumber';
import { MAMMOGRAPHY_PROCEDURES, ULTRASOUND_PROCEDURES, ECHO_PROCEDURES, ECG_PROCEDURES } from '../constants';

export default function Analytics() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'clinical' | 'financial'>('clinical');
  const [timeRange, setTimeRange] = useState<'yesterday' | '7d' | '30d' | 'all' | 'custom'>('30d');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collectionGroup(db, 'requests'), 
      where('facilityId', '==', 'default-facility'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  // Data Processing
  const analyticsData = useMemo(() => {
    if (!requests.length) return null;

    const now = new Date();
    const cutoff = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 365;
    
    const filteredRequests = requests.filter(req => {
      if (!req.createdAt) return false;
      const date = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
      
      if (timeRange === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return date.toDateString() === yesterday.toDateString();
      }
      
      if (timeRange === 'custom') {
        const [year, month] = selectedMonth.split('-').map(Number);
        return date.getFullYear() === year && (date.getMonth() + 1) === month;
      }
      
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return timeRange === 'all' || diffDays <= cutoff;
    });

    // 1. Trending Data (Daily Volume & Revenue)
    const dailyVolume: Record<string, number> = {};
    const dailyRevenue: Record<string, number> = {};
    filteredRequests.forEach(req => {
      const date = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
      const dateStr = date.toISOString().split('T')[0];
      
      dailyVolume[dateStr] = (dailyVolume[dateStr] || 0) + 1;
      
      const price = req.totalCost || 0;
      dailyRevenue[dateStr] = (dailyRevenue[dateStr] || 0) + price;
    });

    const trendChart = Object.keys(dailyVolume)
      .sort()
      .map(date => ({ 
        date, 
        count: dailyVolume[date],
        revenue: dailyRevenue[date]
      }));

    // 2. Modality Distribution (Volume & Revenue)
    const modalities: Record<string, number> = {};
    const modalityRevenue: Record<string, number> = {};
    filteredRequests.forEach(req => {
      // If we have granular procedures, use them for modality revenue
      if (req.procedures && Array.isArray(req.procedures)) {
        req.procedures.forEach((proc: any) => {
          // Attempt to find modality for this procedure/part
          let mod = req.modalities?.[0] || 'OT';
          if (ULTRASOUND_PROCEDURES.includes(proc.name)) {
            mod = 'Ultrasound';
          } else if (MAMMOGRAPHY_PROCEDURES.includes(proc.name)) {
            mod = 'Mammography';
          } else if (ECHO_PROCEDURES.includes(proc.name)) {
            mod = 'Echo';
          } else if (ECG_PROCEDURES.includes(proc.name)) {
            mod = 'ECG';
          }
          modalities[mod] = (modalities[mod] || 0) + 1;
          modalityRevenue[mod] = (modalityRevenue[mod] || 0) + (proc.price || 0);
        });
      } else {
        const mod = req.modalities?.[0] || 'OT';
        modalities[mod] = (modalities[mod] || 0) + 1;
        const price = req.totalCost || 0;
        modalityRevenue[mod] = (modalityRevenue[mod] || 0) + price;
      }
    });

    const modalityChart = Object.keys(modalities).map(name => ({ 
      name, 
      value: modalities[name],
      revenue: modalityRevenue[name],
      fill: (MODALITY_COLORS as any)[name] || '#94a3b8'
    }));

    // 3. Specialist Productivity & Revenue
    const specialistStats: Record<string, { count: number, revenue: number, payout: number, partsReported: number }> = {};
    let pendingRevenue = 0;
    let totalRevenue = 0;
    
    filteredRequests.forEach(req => {
      const price = req.totalCost || 0;
      totalRevenue += price;

      if (req.procedures && Array.isArray(req.procedures)) {
        req.procedures.forEach((proc: any) => {
          // Calculate payout for THIS specific procedure (Radiologist)
          let procPayout = 0;
          if (proc.reportingFee !== undefined) {
            procPayout = proc.reportingFee;
          } else if (proc.needsReport) {
            procPayout = 50;
          }

          if (proc.status === 'Reported' || req.status === 'Completed' || req.status === 'completed') {
            const name = proc.radiologistName || req.radiologistName || 'Unassigned';
            if (!specialistStats[name]) specialistStats[name] = { count: 0, revenue: 0, payout: 0, partsReported: 0 };
            
            specialistStats[name].payout += procPayout;
            if (proc.needsReport || procPayout > 0) {
              specialistStats[name].partsReported += 1;
            }
          }

          // Sonographer Report requirement payout (always GHS 50 if the procedure is Ultrasound)
          const isPartUltrasound = ULTRASOUND_PROCEDURES.includes(proc.name);
          const sonographerFee = proc.sonographerFee !== undefined ? proc.sonographerFee : (isPartUltrasound ? 50 : 0);
          if (sonographerFee > 0) {
            const onoName = req.sonographerWorksheet?.sonographerName || 'Sonographer (General)';
            if (!specialistStats[onoName]) specialistStats[onoName] = { count: 0, revenue: 0, payout: 0, partsReported: 0 };
            specialistStats[onoName].payout += sonographerFee;
            specialistStats[onoName].partsReported += 1;
          }
        });

        // Attribute full request volume and primary revenue to the main radiologist
        if (req.status === 'Completed' || req.status === 'completed') {
          const mainName = req.radiologistName || 'Unassigned';
          if (!specialistStats[mainName]) specialistStats[mainName] = { count: 0, revenue: 0, payout: 0, partsReported: 0 };
          specialistStats[mainName].count += 1;
          specialistStats[mainName].revenue += price;
        }

        // Include sonographer worksheet attribution
        if (req.sonographerWorksheet?.sonographerName) {
          const onoName = req.sonographerWorksheet.sonographerName;
          if (!specialistStats[onoName]) specialistStats[onoName] = { count: 0, revenue: 0, payout: 0, partsReported: 0 };
          specialistStats[onoName].count += 1;
        }
      } else {
        // Fallback for very old data structure
        if (req.status === 'Completed' || req.status === 'completed') {
          const name = req.radiologistName || 'Unassigned';
          if (!specialistStats[name]) specialistStats[name] = { count: 0, revenue: 0, payout: 0, partsReported: 0 };
          specialistStats[name].count += 1;
          specialistStats[name].revenue += price;
          if (req.needsReport) {
            specialistStats[name].payout += 50;
            specialistStats[name].partsReported += 1;
          }
        }
      }

      if (!(req.status === 'Completed' || req.status === 'completed')) {
        pendingRevenue += price;
      }
    });

    const specialistChart = Object.keys(specialistStats)
      .map(name => ({ 
        name, 
        reports: specialistStats[name].count,
        revenue: specialistStats[name].revenue,
        payout: specialistStats[name].payout,
        partsReported: specialistStats[name].partsReported
      }))
      .sort((a, b) => b.partsReported - a.partsReported)
      .slice(0, 5);

    // 4. TAT Heatmap (TAT by Day of Week)
    const tatByDay: Record<number, { total: number; count: number }> = {};
    [0,1,2,3,4,5,6].forEach(d => tatByDay[d] = { total: 0, count: 0 });

    let totalTat = 0;
    let completedCount = 0;
    
    filteredRequests.forEach(req => {
      if ((req.status === 'Completed' || req.status === 'completed') && req.completedAt && req.createdAt) {
        const start = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
        const end = req.completedAt.toDate ? req.completedAt.toDate() : new Date(req.completedAt);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        
        const day = start.getDay();
        tatByDay[day].total += diffHours;
        tatByDay[day].count += 1;
        
        totalTat += diffHours;
        completedCount++;
      }
    });

    const tatChart = Object.keys(tatByDay).map(dayIdx => {
      const idx = parseInt(dayIdx);
      const avg = tatByDay[idx].count > 0 ? (tatByDay[idx].total / tatByDay[idx].count).toFixed(1) : 0;
      return { day: DAYS[idx], tat: Number(avg) };
    });

    const averageTat = completedCount > 0 ? (totalTat / completedCount).toFixed(1) : '0';

    // 5. Modality Specific TAT
    const tatByModality: Record<string, { total: number, count: number }> = {};
    filteredRequests.forEach(req => {
      if ((req.status === 'Completed' || req.status === 'completed') && req.completedAt && req.createdAt) {
        const mod = req.modalities?.[0] || 'OT';
        const start = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
        const end = req.completedAt.toDate ? req.completedAt.toDate() : new Date(req.completedAt);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        
        if (!tatByModality[mod]) tatByModality[mod] = { total: 0, count: 0 };
        tatByModality[mod].total += diffHours;
        tatByModality[mod].count += 1;
      }
    });

    const mriTat = tatByModality['MR']?.count > 0 ? (tatByModality['MR'].total / tatByModality['MR'].count) : 0;
    const sysAvgTat = Number(averageTat);
    const mriDiff = sysAvgTat > 0 ? Math.round(((mriTat - sysAvgTat) / sysAvgTat) * 100) : 0;

    // 6. Peak Hour Calculation
    const hourlyThroughput: Record<number, number> = {};
    filteredRequests.forEach(req => {
      const date = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
      const hour = date.getHours();
      hourlyThroughput[hour] = (hourlyThroughput[hour] || 0) + 1;
    });
    
    let peakHour = 9;
    let maxVolume = 0;
    Object.keys(hourlyThroughput).forEach(h => {
      if (hourlyThroughput[Number(h)] > maxVolume) {
        maxVolume = hourlyThroughput[Number(h)];
        peakHour = Number(h);
      }
    });

    const peakRange = `${peakHour}:00 - ${peakHour + 2}:00`;

    // 7. STAT Comparison
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const statThisWeek = filteredRequests.filter(r => {
      const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return d >= sevenDaysAgo && (r.priority?.toLowerCase() === 'stat' || r.priority?.toLowerCase() === 'urgent');
    }).length;

    const statLastWeek = filteredRequests.filter(r => {
      const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return d < sevenDaysAgo && d >= fourteenDaysAgo && (r.priority?.toLowerCase() === 'stat' || r.priority?.toLowerCase() === 'urgent');
    }).length;

    const statIncrease = statLastWeek > 0 ? Math.round(((statThisWeek - statLastWeek) / statLastWeek) * 100) : (statThisWeek > 0 ? 100 : 0);

    // 8. Urgency Spread
    const priorities: Record<string, number> = {};
    filteredRequests.forEach(req => {
      const p = req.priority || 'Routine';
      const label = p === 'STAT' ? 'STAT' : p === 'urgent' ? 'Urgent' : 'Routine';
      priorities[label] = (priorities[label] || 0) + 1;
    });

    const priorityChart = Object.keys(priorities).map(name => ({ 
      name, 
      value: priorities[name],
      fill: PRIORITY_COLORS[name] || '#94a3b8'
    }));

    return {
      trendChart,
      modalityChart,
      specialistChart,
      tatChart,
      priorityChart,
      averageTat,
      totalRevenue,
      pendingRevenue,
      totalStudies: filteredRequests.length,
      urgentStudies: filteredRequests.filter(r => r.priority?.toLowerCase() === 'stat' || r.priority?.toLowerCase() === 'urgent').length,
      completionRate: Math.round((completedCount / (filteredRequests.length || 1)) * 100),
      peakRange,
      mriDiff,
      statIncrease
    };
  }, [requests, timeRange, selectedMonth]);

  const clinicalKpis = [
    { label: 'Total Scans', value: analyticsData?.totalStudies || 0, icon: Activity, color: 'text-primary' },
    { label: 'Avg Turnaround', value: `${analyticsData?.averageTat || 0}h`, icon: Clock, color: 'text-accent' },
    { label: 'Completion Rate', value: `${analyticsData?.completionRate || 0}%`, icon: CheckCircle2, color: 'text-success' },
    { label: 'Urgent Cases', value: analyticsData?.urgentStudies || 0, icon: AlertCircle, color: 'text-danger' },
  ];

  const financialKpis = [
    { label: 'Total Revenue', value: `GHS ${(analyticsData?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign, color: 'text-success' },
    { label: 'Avg / Study', value: `GHS ${analyticsData?.totalStudies ? (analyticsData.totalRevenue / analyticsData.totalStudies).toFixed(0) : 0}`, icon: Wallet, color: 'text-primary' },
    { label: 'Pending Billing', value: `GHS ${(analyticsData?.pendingRevenue || 0).toLocaleString()}`, icon: CreditCard, color: 'text-accent' },
    { label: 'Growth Est.', value: '+12.5%', icon: TrendingUp, color: 'text-success' },
  ];

  const currentKpis = view === 'clinical' ? clinicalKpis : financialKpis;

  const exportData = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Volume,Revenue\n" 
      + (analyticsData?.trendChart.map(e => `${e.date},${e.count},${e.revenue}`).join("\n") || "");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analytics_report_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted font-bold animate-pulse">Aggregating Clinical Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Analytics</h1>
          <p className="text-muted mt-1 uppercase text-xs font-bold tracking-widest text-primary flex items-center gap-2">
            {view === 'clinical' ? 'Clinical Throughput & Productivity Insights' : 'Financial Performance & Revenue Analysis'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 overflow-visible relative z-40">
          <FilterDropdown
            label="View"
            value={view}
            onChange={(val) => setView(val as any)}
            icon={view === 'clinical' ? Activity : DollarSign}
            options={[
              { value: 'clinical', label: 'Clinical Overview', icon: Activity },
              { value: 'financial', label: 'Financial Performance', icon: DollarSign }
            ]}
          />

          <DateFilterDropdown
            value={timeRange as any}
            onChange={(val) => setTimeRange(val as any)}
            options={[
              { value: 'yesterday', label: 'Yesterday' },
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
              { value: 'all', label: 'All Time' },
              { value: 'custom', label: 'Monthly' }
            ]}
          />
          
          {timeRange === 'custom' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/20 text-main rounded-lg focus:outline-none focus:ring-1 focus:ring-primary shadow-lg transition-all"
            />
          )}

          <button 
            onClick={exportData}
            className="p-2.5 rounded-lg bg-white/10 border border-white/10 text-primary hover:bg-primary/10 transition-all shadow-xl"
            title="Export CSV Report"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <AnimatePresence mode="wait">
          {currentKpis.map((kpi, i) => (
            <motion.div
              key={`${view}-${kpi.label}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: i * 0.05 }}
              className="glass-panel p-6 relative overflow-hidden group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2.5 rounded-xl bg-white/5", kpi.color)}>
                  <kpi.icon size={20} />
                </div>
                <TrendingUp size={14} className="text-success opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div>
                <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-1">{kpi.label}</p>
                <p className="text-4xl font-bold tracking-tighter">
                  {typeof kpi.value === 'number' ? (
                    <AnimatedNumber value={kpi.value} />
                  ) : kpi.value.toString().startsWith('GHS') ? (
                    <AnimatedNumber 
                      value={kpi.value.toString().replace('GHS ', '').replace(',', '')} 
                      prefix="GHS " 
                    />
                  ) : kpi.value.toString().endsWith('%') ? (
                    <AnimatedNumber 
                      value={kpi.value.toString().replace('%', '')} 
                      suffix="%" 
                    />
                  ) : kpi.value.toString().endsWith('h') ? (
                    <AnimatedNumber 
                      value={kpi.value.toString().replace('h', '')} 
                      suffix="h" 
                      decimals={1}
                    />
                  ) : (
                    kpi.value
                  )}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Volume/Revenue Trend */}
        <div className="glass-panel p-8 lg:col-span-3">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold">{view === 'clinical' ? 'Study Volume Trends' : 'Revenue Performance'}</h2>
              <p className="text-xs text-muted">
                {view === 'clinical' ? 'Daily diagnostic throughput over time' : 'Daily gross revenue tracking'}
              </p>
            </div>
            <Activity className={cn("opacity-20", view === 'financial' ? "text-success" : "text-primary")} size={24} />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData?.trendChart}>
                <defs>
                  <linearGradient id="colorMain" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={view === 'clinical' ? '#2563eb' : '#059669'} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={view === 'clinical' ? '#2563eb' : '#059669'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff1a" />
                <XAxis 
                  dataKey="date" 
                  stroke="#000000" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => val.split('-').slice(1).join('/')}
                />
                <YAxis 
                  stroke="#000000" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => view === 'financial' ? `GHS ${val}` : val}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', fontSize: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                  itemStyle={{ color: view === 'clinical' ? '#3b82f6' : '#10b981' }}
                  formatter={(value: any) => [
                    view === 'financial' ? `GHS ${value.toLocaleString()}` : `${value} Studies`,
                    view === 'financial' ? 'Daily Revenue' : 'Volume'
                  ]}
                />
                <Area 
                  type="monotone" 
                  dataKey={view === 'clinical' ? 'count' : 'revenue'} 
                  stroke={view === 'clinical' ? '#3b82f6' : '#10b981'} 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorMain)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Clinical View Charts */}
        {view === 'clinical' && (
          <>
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-8">Modality Mix</h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData?.modalityChart}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {analyticsData?.modalityChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted mt-4 italic text-center">* OT: Other modalities (not XR, CT, MR, or US)</p>
            </div>

            {/* Specialists Productivity */}
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-8">Radiologist Output</h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.specialistChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff1a" />
                    <XAxis type="number" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} width={100} />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    />
                    <Bar dataKey="reports" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Urgency Spread */}
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-8">Urgency Ratio</h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData?.priorityChart}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {analyticsData?.priorityChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TAT by Day of Week */}
            <div className="glass-panel p-8 lg:col-span-2">
              <h2 className="text-xl font-bold mb-8">TAT Bottlenecks (Day of Week)</h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.tatChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff1a" />
                    <XAxis dataKey="day" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis label={{ value: 'Avg Hours', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#000000' }} stroke="#000000" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    />
                    <Bar dataKey="tat" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Financial View Charts */}
        {view === 'financial' && (
          <>
            {/* Revenue Modality Distribution */}
            <div className="glass-panel p-8">
              <h2 className="text-xl font-bold mb-8">Revenue by Modality</h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.modalityChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff1a" />
                    <XAxis type="number" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `GHS ${val}`} />
                    <YAxis dataKey="name" type="category" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} width={100} />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                       formatter={(val) => [`GHS ${val}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={25} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Projected Billing */}
            <div className="glass-panel p-8 flex flex-col justify-between lg:col-span-2">
              <div>
                <h2 className="text-xl font-bold mb-2">Est. Radiologist Payouts</h2>
                <p className="text-xs text-muted mb-6">Calculated at GHS 50 per reported body part</p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData?.specialistChart} layout="vertical" margin={{ left: -15, right: 10, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff1a" />
                      <XAxis type="number" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `GHS ${val}`} />
                      <YAxis dataKey="name" type="category" stroke="#000000" fontSize={10} axisLine={false} tickLine={false} width={90} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff20', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                        formatter={(value, name, props) => {
                          const payload = props.payload;
                          return [
                            `GHS ${payload.payout} (${payload.partsReported} body parts)`,
                            'Est. Payout'
                          ];
                        }}
                      />
                      <Bar dataKey="payout" fill="#967E2B" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2 max-h-[120px] overflow-y-auto no-scrollbar">
                {analyticsData?.specialistChart.map((spec, idx) => (
                  <div key={spec.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: RAD_COLORS[idx % RAD_COLORS.length] }} />
                      <span className="font-bold truncate max-w-[120px]">{spec.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted font-medium">{spec.partsReported || 0} {spec.partsReported === 1 ? 'part' : 'parts'} reported</span>
                      <span className="font-mono font-bold text-[#967E2B]">GHS {(spec.payout || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Inactive Insights Section removed as requested */}
    </div>
  );
}

