/**
 * STANDARD BUILD — real backend JWT auth (bcrypt + Postgres).
 * Same context shape as before so all pages keep working; Google OAuth and
 * the reviewer bypass are gone. Demo login = seeded superadmin.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getAuthToken } from '../api/apiClient';
import { syncSessionUser } from '../api/live';
import { UserProfile } from '../api/types';
import { logAction } from '../services/loggerService';

export type UserRole = UserProfile['role'];

export const REVIEWER_CREDENTIALS = {
  email: 'admin@kingsimaging.org',
  password: 'ChangeMe123!',
  accessCode: 'ChangeMe123!',
};

export interface LocalUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  profile: UserProfile | null;
  realProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (email?: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  loginAsReviewer: (identifier?: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  emulateRole: (role: UserRole | null) => void;
  isEmulating: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  isReviewerSession: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const toUser = (p: UserProfile): LocalUser => ({
  uid: p.uid,
  email: p.email,
  displayName: p.displayName,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [emulatedRole, setEmulatedRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveProfile = profile && emulatedRole ? { ...profile, role: emulatedRole } : profile;

  useEffect(() => {
    (async () => {
      try {
        if (!getAuthToken()) { setLoading(false); return; }
        const me = await api.auth.getMe();
        if (me) {
          setProfile(me);
          setUser(toUser(me));
          syncSessionUser({ uid: me.uid, email: me.email, displayName: me.displayName });
        }
      } catch (err) {
        console.warn('AuthContext: session restore failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const doLogin = async (email = '', password = '') => {
    try {
      setLoading(true);
      setError(null);
      const cleanEmail = email.trim();
      if (!cleanEmail || !password) {
        const msg = 'Email and password are required.';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
      const res = await api.auth.loginWithToken({ email: cleanEmail, password });
      setProfile(res.user);
      setUser(toUser(res.user));
      syncSessionUser({ uid: res.user.uid, email: res.user.email, displayName: res.user.displayName });
      setLoading(false);
      logAction({
        action: 'LOGIN',
        details: `User ${res.user.displayName} logged in`,
        facilityId: res.user.facilityId || 'default-facility',
      });
      return { success: true };
    } catch (err: any) {
      const msg = err.message || 'Login failed';
      setError(msg);
      setLoading(false);
      return { success: false, error: msg };
    }
  };

  const handleLogout = async () => {
    setUser(null);
    setProfile(null);
    setEmulatedRole(null);
    syncSessionUser(null);
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn('AuthContext: logout notice:', err);
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    const updated = await api.auth.updateUser(user.uid, data);
    setProfile(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: effectiveProfile,
        realProfile: profile,
        loading,
        error,
        login: doLogin,
        loginAsReviewer: doLogin,
        logout: handleLogout,
        emulateRole: setEmulatedRole,
        isEmulating: !!emulatedRole,
        updateProfile,
        isReviewerSession: profile?.role === 'superadmin' && !emulatedRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
