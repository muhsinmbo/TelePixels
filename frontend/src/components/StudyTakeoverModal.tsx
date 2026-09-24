import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, UserCheck, X, AlertTriangle, User, FileText } from 'lucide-react';

interface StudyTakeoverModalProps {
  isOpen: boolean;
  activeReporterName: string;
  activeReporterRole?: string;
  patientName?: string;
  patientId?: string;
  procedureName?: string;
  onConfirmTakeover: () => void;
  onCancel: () => void;
}

export const StudyTakeoverModal: React.FC<StudyTakeoverModalProps> = ({
  isOpen,
  activeReporterName,
  activeReporterRole,
  patientName,
  patientId,
  procedureName,
  onConfirmTakeover,
  onCancel,
}) => {
  if (!isOpen) return null;

  const formattedRole = activeReporterRole 
    ? activeReporterRole.charAt(0).toUpperCase() + activeReporterRole.slice(1)
    : 'Clinical Staff';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop overlay identical to AccessPassModal / ReceiptModal */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          className="relative w-full max-w-md bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white"
        >
          {/* Top amber accent border */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md mb-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  Study In Use
                </span>
                <h2 className="text-base font-bold tracking-tight uppercase text-white leading-tight">
                  Study Currently Being Reported
                </h2>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-4">
            {/* Reporter details panel */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs uppercase font-bold text-white/50 tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  Active Reporter
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {activeReporterName || 'Another clinician'}
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                    {formattedRole}
                  </span>
                </div>
              </div>

              {(patientName || patientId || procedureName) && (
                <div className="space-y-2 text-xs pt-0.5">
                  {patientName && (
                    <div className="flex justify-between items-center">
                      <span className="text-white/50">Patient:</span>
                      <span className="font-bold text-white">{patientName}</span>
                    </div>
                  )}
                  {patientId && (
                    <div className="flex justify-between items-center">
                      <span className="text-white/50">MRN / ID:</span>
                      <span className="font-mono font-bold text-primary">{patientId}</span>
                    </div>
                  )}
                  {procedureName && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-white/50 shrink-0">Procedure:</span>
                      <span className="font-medium text-white/90 text-right truncate max-w-[220px]">
                        {procedureName}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warning notice banner */}
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3.5 flex items-start gap-3">
              <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                <strong className="text-amber-300">{activeReporterName || 'Another clinician'}</strong> is currently editing this study. Taking over will transfer active reporting ownership to your workstation.
              </p>
            </div>

            {/* Action buttons matching glass-btn style */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="glass-btn flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-semibold text-xs uppercase tracking-wider py-3 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmTakeover}
                className="glass-btn flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20"
              >
                <UserCheck className="w-4 h-4" />
                Take Over Study
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

