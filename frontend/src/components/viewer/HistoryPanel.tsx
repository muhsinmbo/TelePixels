import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { History, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function HistoryPanel() {
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const patientId = searchParams.get('patientId');
  const requestId = searchParams.get('requestId');
  
  const [receptionistHistory, setReceptionistHistory] = useState('');
  const [radiographerHistory, setRadiographerHistory] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const canEdit = profile?.role === 'radiographer' || profile?.role === 'sonographer' || profile?.role === 'facilityadmin' || profile?.role === 'superadmin';

  useEffect(() => {
    if (patientId && requestId) {
      const fetchRequest = async () => {
        setIsLoading(true);
        try {
          const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
          const snap = await getDoc(reqRef);
          if (snap.exists()) {
            const data = snap.data();
            setReceptionistHistory(data.clinicalInfo || 'No history provided by receptionist.');
            setRadiographerHistory(data.radiographerHistory || '');
          }
        } catch (err) {
          console.error('Error fetching request history:', err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchRequest();
    }
  }, [patientId, requestId]);

  const handleSave = async () => {
    if (!patientId || !requestId ) return;

    setIsSaving(true);
    setStatus('idle');

    try {
      const reqRef = doc(db, 'patients', patientId, 'requests', requestId);
      await updateDoc(reqRef, {
        radiographerHistory: radiographerHistory,
        updatedAt: serverTimestamp()
      });

      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Error saving history:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to save history');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-transparent p-1 flex flex-col min-h-0 text-slate-100 [.theme-teleradiology_&]:text-black">
      <div className="flex items-center gap-2 text-xs font-black text-slate-200 [.theme-teleradiology_&]:text-black uppercase tracking-wider mb-4 border-b border-white/10 [.theme-teleradiology_&]:border-slate-300 pb-2">
        <History className="w-3.5 h-3.5 text-[#967E2B] [.theme-teleradiology_&]:text-[#856d1e]" />
        <span className="text-slate-100 [.theme-teleradiology_&]:text-black font-black">Case History</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin scrollbar-thumb-white/20 [.theme-teleradiology_&]:scrollbar-thumb-slate-400">
        {/* Receptionist History (Read-only for all) */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider flex items-center gap-2">
            Receptionist Findings
            <span className="px-1.5 py-0.5 rounded bg-white/10 [.theme-teleradiology_&]:bg-slate-200 text-[8px] border border-white/10 [.theme-teleradiology_&]:border-slate-300 uppercase font-bold text-slate-200 [.theme-teleradiology_&]:text-slate-900">System</span>
          </label>
          <div className="w-full bg-white/[0.03] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 rounded-lg p-3 text-xs text-slate-100 [.theme-teleradiology_&]:text-black leading-relaxed font-semibold italic">
            {receptionistHistory}
          </div>
        </div>

        {/* Radiographer Clinical History */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 [.theme-teleradiology_&]:text-slate-900 uppercase font-black tracking-wider flex items-center gap-2">
            Radiographer Clinical History
            {canEdit && (
              <span className="px-1.5 py-0.5 rounded bg-[#967E2B]/10 text-[#967E2B] [.theme-teleradiology_&]:text-[#7c6820] text-[8px] border border-[#967E2B]/20 uppercase font-bold animate-pulse">Editable</span>
            )}
          </label>
          {canEdit ? (
            <textarea
              value={radiographerHistory}
              onChange={(e) => setRadiographerHistory(e.target.value)}
              className="w-full h-40 bg-white/[0.03] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 rounded-lg p-3 text-xs text-slate-100 [.theme-teleradiology_&]:text-black focus:outline-none focus:border-[#967E2B] transition-all resize-none leading-relaxed font-semibold"
              placeholder="Enter clinical observations, patient symptoms, or technical notes..."
            />
          ) : (
            <div className="w-full bg-white/[0.03] [.theme-teleradiology_&]:bg-slate-100 border border-white/10 [.theme-teleradiology_&]:border-slate-300 rounded-lg p-3 text-xs text-slate-100 [.theme-teleradiology_&]:text-black leading-relaxed font-semibold">
              {radiographerHistory || 'No additional history provided.'}
            </div>
          )}
        </div>

        {status === 'error' && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">{errorMessage}</span>
          </div>
        )}

        {status === 'success' && (
          <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2 text-primary">
            <CheckCircle className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium leading-tight">History updated successfully!</span>
          </div>
        )}

        {canEdit && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl bg-[#967E2B] text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Clinical History
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
