import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, REVIEWER_CREDENTIALS } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, ShieldCheck, Key, Lock, Eye, EyeOff, Copy, Check, ArrowRight } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

export default function Login() {
  const { user, profile, login, loginAsReviewer, loading, error: authError } = useAuth();
  const [theme, setTheme] = useState<'cyber' | 'teleradiology'>('cyber');
  const [activeTab, setActiveTab] = useState<'google' | 'reviewer'>('google');
  
  // Reviewer credentials form state
  const [reviewerId, setReviewerId] = useState('');
  const [reviewerPassword, setReviewerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingReviewer, setIsSubmittingReviewer] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const [isVisible, setIsVisible] = React.useState(true);
  const movementRef = React.useRef({ x: 0, y: 0, accumulated: 0 });

  React.useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isVisible) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (movementRef.current.x === 0 && movementRef.current.y === 0) {
        movementRef.current.x = clientX;
        movementRef.current.y = clientY;
        return;
      }

      const dx = Math.abs(clientX - movementRef.current.x);
      const dy = Math.abs(clientY - movementRef.current.y);
      
      movementRef.current.accumulated += dx + dy;
      movementRef.current.x = clientX;
      movementRef.current.y = clientY;

      if (movementRef.current.accumulated > 300) {
        setIsVisible(true);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, [isVisible]);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemSettings', 'global'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.theme) {
          setTheme(data.theme);
        }
      }
    }, (error) => {
      console.warn('Login settings listener failed:', error);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (theme === 'teleradiology') {
      document.body.classList.add('theme-teleradiology');
    } else {
      document.body.classList.remove('theme-teleradiology');
    }
  }, [theme]);

  const handleReviewerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setIsSubmittingReviewer(true);
    try {
      const res = await loginAsReviewer(reviewerId, reviewerPassword);
      if (!res.success) {
        setLocalError(res.error || 'Failed to authenticate as reviewer.');
      } else {
        toast.success('Super Admin access authenticated');
      }
    } catch (err: any) {
      setLocalError(err.message || 'An error occurred during reviewer login.');
    } finally {
      setIsSubmittingReviewer(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`Copied ${fieldName} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) return (
    <div className={cn("min-h-screen flex items-center justify-center bg-[var(--background)]", theme === 'teleradiology' && "theme-teleradiology")}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-primary font-mono animate-pulse">Initializing Secure Session...</p>
      </div>
    </div>
  );

  if (user && profile) return <Navigate to="/" />;

  const displayError = localError || authError;

  return (
    <div className={cn("min-h-screen flex items-center justify-center p-4 relative overflow-hidden", theme === 'teleradiology' && "theme-teleradiology")}>
      {/* Background Image with Overlay */}
      <motion.div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("/login-bg.png")' }}
        animate={{
          scale: [1.05, 1.15, 1.05],
          x: [0, -15, 15, 0],
          y: [0, 10, -10, 0],
          rotate: [0, 1, -1, 0]
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"></div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ 
          opacity: isVisible ? 1 : 0, 
          y: isVisible ? 0 : 20,
          scale: isVisible ? 1 : 0.95
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="glass-panel p-6 sm:p-8 md:p-10 max-w-lg w-full relative z-10 shadow-2xl border border-white/10"
        style={{ pointerEvents: isVisible ? 'auto' : 'none' }}
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-3">
            <BrandLogo className="scale-110" />
          </div>
          <p className="text-xs text-muted max-w-sm">
            {theme === 'cyber' ? 'Next-Generation Teleradiology & Diagnostics Platform' : 'Professional Diagnostic Management System'}
          </p>
        </div>

        {/* Dual Procedure Tab Navigation */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/30 border border-white/10 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => { setActiveTab('google'); setLocalError(null); }}
            className={cn(
              "py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === 'google'
                ? "bg-primary text-black shadow-md"
                : "text-muted hover:text-white hover:bg-white/5"
            )}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Staff Login</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('reviewer'); setLocalError(null); }}
            className={cn(
              "py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer relative",
              activeTab === 'reviewer'
                ? "bg-amber-400 text-black shadow-md font-bold"
                : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10"
            )}
          >
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Reviewer Access</span>
          </button>
        </div>

        {/* Error Notification */}
        {displayError && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium flex items-start gap-2.5"
          >
            <span className="font-bold shrink-0">Error:</span>
            <span>{displayError}</span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* PROCEDURE 1: Regular Google OAuth Flow */}
          {activeTab === 'google' && (
            <motion.div
              key="google-flow"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-center space-y-2">
                <p className="text-xs font-medium text-white/90">Clinical & Administrative Personnel</p>
                <p className="text-[11px] text-muted">
                  Use your authorized Google account to authenticate into the clinical diagnostic portal.
                </p>
              </div>

              <button 
                onClick={login}
                className="glass-btn bg-primary text-black font-bold w-full py-3.5 flex items-center justify-center gap-2.5 hover:bg-primary/85 transition-all shadow-lg active:scale-[0.99] cursor-pointer"
              >
                <LogIn className="w-5 h-5" />
                <span>Sign in with Google</span>
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('reviewer')}
                  className="text-[11px] text-muted hover:text-amber-400 transition-colors inline-flex items-center gap-1 font-medium underline underline-offset-4 cursor-pointer"
                >
                  Evaluating this pitch? Switch to Reviewer Access &rarr;
                </button>
              </div>
            </motion.div>
          )}

          {/* PROCEDURE 2: Pitch Reviewer Super Admin Access */}
          {activeTab === 'reviewer' && (
            <motion.div
              key="reviewer-flow"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Reviewer Credentials Header Card */}
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reviewer Credentials</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/20">
                    Super Admin
                  </span>
                </div>

                <p className="text-[11px] text-muted leading-relaxed">
                  Enter the assigned evaluation credentials below to access the full diagnostic suite with unrestricted Super Admin authority.
                </p>

                {/* Test Credentials Reference Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase font-bold text-muted">Reviewer Email</div>
                      <div className="text-[11px] font-mono text-white truncate">{REVIEWER_CREDENTIALS.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(REVIEWER_CREDENTIALS.email, 'Email')}
                      className="p-1 rounded text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Copy Email"
                    >
                      {copiedField === 'Email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase font-bold text-muted">Password</div>
                      <div className="text-[11px] font-mono text-white truncate">{REVIEWER_CREDENTIALS.password}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(REVIEWER_CREDENTIALS.password, 'Password')}
                      className="p-1 rounded text-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Copy Password"
                    >
                      {copiedField === 'Password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Reviewer Login Form */}
              <form onSubmit={handleReviewerSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                    Reviewer ID / Access Email
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={reviewerId}
                      onChange={(e) => setReviewerId(e.target.value)}
                      placeholder="reviewer@kingsimaging.org"
                      required
                      className="w-full bg-black/30 border border-white/15 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none transition-colors"
                    />
                    <Key className="w-4 h-4 text-white/30 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                    Security Passcode
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      value={reviewerPassword}
                      onChange={(e) => setReviewerPassword(e.target.value)}
                      placeholder="Enter security passcode"
                      required
                      className="w-full bg-black/30 border border-white/15 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button 
                    type="submit"
                    disabled={isSubmittingReviewer}
                    className="glass-btn bg-amber-400 hover:bg-amber-300 text-black font-black w-full py-3 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
                  >
                    {isSubmittingReviewer ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Super Admin...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Login as Super Admin</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Security Notice */}
        <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-muted">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-primary/70" />
            <span>256-Bit Encrypted Platform</span>
          </div>
          <span className="font-mono text-[10px] text-white/40">Enterprise Diagnostic Portal</span>
        </div>
      </motion.div>

      {!isVisible && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none"
        >
          <div className="flex flex-col items-center gap-4">
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-12 h-12 border border-white/20 rounded-full flex items-center justify-center"
            >
              <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
            </motion.div>
            <p className="text-white/40 font-mono text-xs uppercase tracking-[0.3em]">
              Shake to Reveal Secure Portal
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

