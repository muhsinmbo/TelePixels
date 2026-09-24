import React from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { Eye, EyeOff, FlaskConical, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function DevPerspectiveSwitcher() {
  const { profile, realProfile, user, emulateRole, isEmulating } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  // Show for all authorized super admins based on their actual un-emulated role
  const isSuperAdmin = realProfile?.role === 'superadmin' || user?.email === 'alienwaregl01@gmail.com';
  if (!isSuperAdmin) return null;

  const roles: UserRole[] = ['superadmin', 'facilityadmin', 'radiologist', 'radiographer', 'sonographer', 'receptionist'];

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="glass-panel p-4 w-64 shadow-2xl border-primary/20"
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
              <FlaskConical className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest">Test Perspectives</span>
            </div>
            
            <div className="space-y-1">
              <button 
                onClick={() => {
                  emulateRole(null);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between",
                  !isEmulating ? "bg-primary text-black font-bold" : "text-muted hover:bg-white/5"
                )}
              >
                <span>Original (Super Admin)</span>
                {!isEmulating && <Eye className="w-3 h-3" />}
              </button>

              {roles.filter(r => r !== 'superadmin').map(role => (
                <button 
                  key={role}
                  onClick={() => {
                    emulateRole(role);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between capitalize",
                    profile?.role === role && isEmulating ? "bg-primary/20 text-primary font-bold" : "text-muted hover:bg-white/5"
                  )}
                >
                  <span>{role.replace('admin', ' Admin')}</span>
                  {profile?.role === role && isEmulating && <Eye className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300",
          isEmulating 
            ? "bg-warning text-black ring-4 ring-warning/20 animate-pulse" 
            : "bg-primary text-black hover:scale-110 active:scale-95"
        )}
        title="Test Perspective"
      >
        {isEmulating ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
      </button>

      {isEmulating && (
        <div className="bg-warning text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shadow-lg">
          Emulating {profile?.role}
        </div>
      )}
    </div>
  );
}
