import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface InactivityTrackerProps {
  children: React.ReactNode;
  timeoutMs?: number; // Default 5 minutes
}

export default function InactivityTracker({ children, timeoutMs = 300000 }: InactivityTrackerProps) {
  const [isInactive, setIsInactive] = React.useState(false);
  const [isRevealing, setIsRevealing] = React.useState(false);
  const movementRef = React.useRef({ x: 0, y: 0, accumulated: 0 });
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = React.useCallback(() => {
    if (isInactive) return; // Don't reset if already in screen saver mode
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsInactive(true);
      movementRef.current.accumulated = 0; // Reset accumulated movement when entering
    }, timeoutMs);
  }, [isInactive, timeoutMs]);

  const handleActivity = React.useCallback(() => {
    if (isInactive) {
      setIsInactive(false);
      setIsRevealing(false);
    }
    resetTimeout();
  }, [isInactive, resetTimeout]);

  const handleShake = React.useCallback((e: MouseEvent | TouchEvent) => {
    if (!isInactive) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

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

    // Threshold for "shaking" to dismiss - 400 pixels of total movement
    if (movementRef.current.accumulated > 400 && !isRevealing) {
      setIsRevealing(true);
      setTimeout(() => {
        setIsInactive(false);
        setIsRevealing(false);
        resetTimeout();
      }, 800);
    }
  }, [isInactive, isRevealing, resetTimeout]);

  React.useEffect(() => {
    // Events that count as activity
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    window.addEventListener('mousemove', handleShake);
    window.addEventListener('touchmove', handleShake);

    resetTimeout();

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('mousemove', handleShake);
      window.removeEventListener('touchmove', handleShake);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleActivity, handleShake, resetTimeout]);

  return (
    <>
      {children}
      <AnimatePresence>
        {isInactive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isRevealing ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            onClick={() => {
              setIsInactive(false);
              setIsRevealing(false);
            }}
            className="fixed inset-0 z-[9999] overflow-hidden pointer-events-auto cursor-pointer"
          >
            {/* Background Image */}
            <motion.div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: 'url("/login-bg.png")' }}
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 1, -1, 0]
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear"
              }}
            >
              {/* Blur Overlay */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            </motion.div>

            {/* Hint UI */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="relative">
                  <motion.div
                    animate={{ rotate: [0, -15, 15, -15, 15, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="w-20 h-20 border border-white/20 rounded-full flex items-center justify-center"
                  >
                    <div className="w-4 h-4 bg-primary rounded-full animate-ping" />
                  </motion.div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-white/60 font-mono text-sm uppercase tracking-[0.4em] animate-pulse">
                    Session Paused
                  </p>
                  <p className="text-white/40 text-xs font-mono uppercase tracking-[0.2em]">
                    Click or move to resume
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
