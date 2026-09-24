import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout } from '../firebase';
import { logAction } from '../services/loggerService';

export type UserRole = 'superadmin' | 'facilityadmin' | 'radiologist' | 'radiographer' | 'sonographer' | 'receptionist';

export const REVIEWER_CREDENTIALS = {
  email: 'reviewer@kingsimaging.org',
  password: 'KingSuperAdmin2026!',
  accessCode: 'PITCH2026'
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'active' | 'inactive';
  facilityId?: string;
  facilityName?: string;
  facilityLetterhead?: string;
  facilityLogo?: string;
  createdAt?: any;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
  patientEmailTemplate?: string;
  physicianEmailTemplate?: string;
  radiologistEmailTemplate?: string;
  systemTheme?: 'cyber' | 'teleradiology';
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  realProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  loginAsReviewer: (identifier?: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  emulateRole: (role: UserRole | null) => void;
  isEmulating: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  isReviewerSession: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const createReviewerUser = (profile: UserProfile): FirebaseUser => {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    emailVerified: true,
    isAnonymous: false,
    phoneNumber: null,
    photoURL: null,
    providerId: 'reviewer-bypass',
    tenantId: null,
    providerData: [{
      providerId: 'password',
      uid: profile.uid,
      displayName: profile.displayName,
      email: profile.email,
      phoneNumber: null,
      photoURL: null
    }],
    delete: async () => {},
    getIdToken: async () => 'reviewer-token',
    getIdTokenResult: async () => ({
      token: 'reviewer-token',
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      signInProvider: 'custom',
      signInSecondFactor: null,
      claims: { email: profile.email, role: 'superadmin' }
    }),
    reload: async () => {},
    toJSON: () => ({ uid: profile.uid, email: profile.email })
  } as unknown as FirebaseUser;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isReviewerSession, setIsReviewerSession] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('pitch_reviewer_session');
    } catch {
      return false;
    }
  });
  const [emulatedRole, setEmulatedRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveProfile = profile && emulatedRole 
    ? { ...profile, role: emulatedRole } 
    : profile;

  useEffect(() => {
    // 1. Check for active Pitch Reviewer Super Admin session in localStorage
    const initReviewerSession = async () => {
      try {
        const savedSession = localStorage.getItem('pitch_reviewer_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (parsed && parsed.uid) {
            console.log('AuthContext: Restoring Pitch Reviewer Super Admin session');
            const reviewerUser = createReviewerUser(parsed);
            setUser(reviewerUser);
            setProfile(parsed);
            setIsReviewerSession(true);
            
            // Seed pricing for reviewer
            const { seedDefaultPricing } = await import('../services/pricingInitialiser');
            seedDefaultPricing('default-facility');
            
            setLoading(false);
            return true;
          }
        }
      } catch (err) {
        console.warn('AuthContext: Failed to restore reviewer session:', err);
      }
      return false;
    };

    initReviewerSession();

    console.log('AuthContext: Setting up onAuthStateChanged...');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('AuthContext: onAuthStateChanged fired, user:', user?.uid);
      if (user) {
        // Real Google auth active - takes precedence over reviewer session
        localStorage.removeItem('pitch_reviewer_session');
        setIsReviewerSession(false);
        setUser(user);
        try {
          console.log('AuthContext: Fetching profile for', user.uid);
          const docRef = doc(db, 'users', user.uid);
          let docSnap = await getDoc(docRef);
          
          let profileData: UserProfile | null = null;

          // Fetch global facility name if it exists from systemSettings/global
          let globalFacilityName = "King's Diagnostic Imaging and Research Center";
          let shouldUpdateGlobal = false;
          try {
            const globalDoc = await getDoc(doc(db, 'systemSettings', 'global'));
            if (globalDoc.exists()) {
              const currentName = globalDoc.data().facilityName;
              if (currentName && currentName !== 'Golden Heart Diagnostic Imaging Center') {
                globalFacilityName = currentName;
              } else {
                shouldUpdateGlobal = true;
              }
            } else {
              shouldUpdateGlobal = true;
            }
          } catch (err) {
            console.warn('AuthContext: Failed to fetch global settings, using default', err);
          }

          if (docSnap.exists()) {
            console.log('AuthContext: Found profile in users collection');
            profileData = docSnap.data() as UserProfile;

            let profileNeedsUpdate = false;
            
            const cleanLegacyText = (str?: string) => {
              if (!str) return str;
              return str
                .replace(/[┌┐└┘│]/g, '')
                .replace(/─{3,}/g, '----------------------------------------')
                .replace(/⭐\s*Rated\s*4\.8\/5\s*Stars.*$/gm, '')
                .replace(/⭐\s*\*?4\.8\/5★.*$/gm, '')
                .replace(/URGENT:\s*/gi, '')
                .replace(/🔑|▶|📋|🏥|⭐|🗝|🌐|✨/g, '')
                .replace(/Ayana Complex,?\s*Hospital Road,?\s*Tamale/gi, "Saint Charles Road (Before Attaesibi Hotel), Digital Address NT-0061-5616, Tamale, Northern Region, Ghana")
                .replace(/Ayana Complex/gi, "Saint Charles Road (Before Attaesibi Hotel)")
                .replace(/Hospital Road/gi, "Saint Charles Road")
                .replace(/\+233\s*244[- ]*818390/gi, "+233 50 025 2793 / +233 55 058 3106")
                .replace(/King's Diagnostic Imaging and Research Center and Research Centre/gi, "King's Diagnostic Imaging and Research Centre")
                .replace(/King's Diagnostic Imaging and Research Center and Research Center/gi, "King's Diagnostic Imaging and Research Centre")
                .replace(/Golden Heart Diagnostic Imaging Center/gi, "King's Diagnostic Imaging and Research Centre")
                .replace(/Golden Heart Diagnostic Imaging/gi, "King's Diagnostic Imaging and Research Centre")
                .replace(/Golden Heart/gi, "King's Diagnostic Imaging and Research Centre")
                .trim();
            };

            const isLegacyText = (text?: string) => {
              if (!text) return false;
              return /[┌┐└┘│]|Golden Heart|Ayana|244-818390|244 818390|Hospital Road|Center and Research|URGENT:|⭐/i.test(text);
            };

            if (profileData.facilityName && isLegacyText(profileData.facilityName)) {
              profileData.facilityName = cleanLegacyText(profileData.facilityName) || globalFacilityName;
              profileNeedsUpdate = true;
            }
            
            if (profileData.radiologistEmailTemplate && isLegacyText(profileData.radiologistEmailTemplate)) {
              profileData.radiologistEmailTemplate = cleanLegacyText(profileData.radiologistEmailTemplate);
              profileNeedsUpdate = true;
            }

            if (profileData.patientEmailTemplate && isLegacyText(profileData.patientEmailTemplate)) {
              profileData.patientEmailTemplate = cleanLegacyText(profileData.patientEmailTemplate);
              profileNeedsUpdate = true;
            }

            if (profileData.physicianEmailTemplate && isLegacyText(profileData.physicianEmailTemplate)) {
              profileData.physicianEmailTemplate = cleanLegacyText(profileData.physicianEmailTemplate);
              profileNeedsUpdate = true;
            }

            // Keep facilityName in sync with systemSettings/global if it is different
            if (profileData.facilityName !== globalFacilityName) {
              profileData.facilityName = globalFacilityName;
              profileNeedsUpdate = true;
            }

            if (profileNeedsUpdate) {
              try {
                await updateDoc(docRef, { 
                  facilityName: profileData.facilityName,
                  radiologistEmailTemplate: profileData.radiologistEmailTemplate || null,
                  patientEmailTemplate: profileData.patientEmailTemplate || null,
                  physicianEmailTemplate: profileData.physicianEmailTemplate || null,
                });
              } catch (updateErr) {
                console.warn('AuthContext: Failed to auto-sync user facility name / templates:', updateErr);
              }
            }
            
            // Seed pricing for existing facility if it's an admin
            if (profileData.role === 'superadmin' || profileData.role === 'facilityadmin') {
              const { seedDefaultPricing } = await import('../services/pricingInitialiser');
              seedDefaultPricing('default-facility');

              if (shouldUpdateGlobal) {
                try {
                  await setDoc(doc(db, 'systemSettings', 'global'), {
                    facilityName: "King's Diagnostic Imaging and Research Center"
                  }, { merge: true });
                  globalFacilityName = "King's Diagnostic Imaging and Research Center";
                } catch (globalUpdateErr) {
                  console.warn('AuthContext: Failed to auto-update global settings:', globalUpdateErr);
                }
              }
            }
          } else {
            console.log('AuthContext: Profile not found, checking by email...');
            let preAuthData: UserProfile | null = null;
            let preAuthDocSnap: any = null;

            // Extract email from main profile or provider credentials
            const getEmail = (u: any) => {
              if (u.email) return u.email;
              if (u.providerData) {
                for (const p of u.providerData) {
                  if (p.email) return p.email;
                }
              }
              return null;
            };
            const resolvedEmail = getEmail(user);
            console.log('AuthContext: Resolved sign-in email as:', resolvedEmail, 'from providerData:', JSON.stringify(user.providerData || []));

            if (resolvedEmail) {
              let emailInToken = resolvedEmail;
              try {
                const tokenResult = await user.getIdTokenResult();
                if (tokenResult.claims.email) {
                  emailInToken = tokenResult.claims.email as string;
                }
              } catch (tokenErr) {
                console.warn('AuthContext: Failed to obtain id token result claims:', tokenErr);
              }
              console.log('AuthContext: Case-preserving token email claim resolved as:', emailInToken);

              // 1. First fetch with EXACT casing to satisfy short-circuit in security rules (avoiding matches compiler exceptions)
              const directRefExact = doc(db, 'users', emailInToken);
              try {
                const directSnapExact = await getDoc(directRefExact);
                if (directSnapExact.exists()) {
                  console.log('AuthContext: Found pre-auth profile via exact-case direct doc fetch');
                  preAuthDocSnap = directSnapExact;
                  preAuthData = directSnapExact.data() as UserProfile;
                }
              } catch (directErr) {
                console.warn('AuthContext: Exact-case direct pre-auth fetch failed, catching safely:', directErr);
              }

              // 2. Lowercase direct fetch fallback (ignored/handled gracefully if rules reject due to matches dynamic regex exception)
              if (!preAuthData && emailInToken.toLowerCase() !== emailInToken) {
                const directRefLower = doc(db, 'users', emailInToken.toLowerCase());
                try {
                  const directSnapLower = await getDoc(directRefLower);
                  if (directSnapLower.exists()) {
                    console.log('AuthContext: Found pre-auth profile via lowercase direct doc fetch');
                    preAuthDocSnap = directSnapLower;
                    preAuthData = directSnapLower.data() as UserProfile;
                  }
                } catch (directErr) {
                  console.warn('AuthContext: Lowercase direct pre-auth fetch failed, catching safely:', directErr);
                }
              }

              // 3. List queries fallbacks with strict rules filter alignment
              if (!preAuthData) {
                try {
                  // Query aligned exactly with resource.data.email == request.auth.token.email check in rules
                  const q = query(collection(db, 'users'), where('email', '==', emailInToken));
                  const querySnap = await getDocs(q);
                  if (!querySnap.empty) {
                    console.log('AuthContext: Found pre-auth profile via exact email list query matching security rules');
                    preAuthDocSnap = querySnap.docs[0];
                    preAuthData = preAuthDocSnap.data() as UserProfile;
                  }
                } catch (queryErr) {
                  console.warn('AuthContext: Exact email list query failed, catching safely:', queryErr);

                  // Lowercase query fallback
                  if (emailInToken.toLowerCase() !== emailInToken) {
                    try {
                      const qLower = query(collection(db, 'users'), where('email', '==', emailInToken.toLowerCase()));
                      const querySnapLower = await getDocs(qLower);
                      if (!querySnapLower.empty) {
                        console.log('AuthContext: Found pre-auth profile via lowercase email query');
                        preAuthDocSnap = querySnapLower.docs[0];
                        preAuthData = preAuthDocSnap.data() as UserProfile;
                      }
                    } catch (queryErrLower) {
                      console.warn('AuthContext: Lowercase email list query failed, catching safely:', queryErrLower);
                    }
                  }
                }
              }
            }
            
            if (preAuthData && preAuthDocSnap) {
              const linkedProfile: UserProfile = {
                ...preAuthData,
                uid: user.uid,
                email: resolvedEmail || preAuthData.email || preAuthDocSnap.id, // Ensure correct email is set
                displayName: preAuthData.displayName || user.displayName || '',
                facilityId: 'default-facility',
                facilityName: globalFacilityName,
                status: 'active'
              };
              
              await setDoc(docRef, linkedProfile);

              if (linkedProfile.role === 'superadmin' || linkedProfile.role === 'facilityadmin') {
                const { seedDefaultPricing } = await import('../services/pricingInitialiser');
                seedDefaultPricing('default-facility');
              }
              
              // Clean up the temporary pre-auth document
              if (preAuthDocSnap.id !== user.uid) {
                try {
                  const { deleteDoc } = await import('firebase/firestore');
                  await deleteDoc(preAuthDocSnap.ref);
                  console.log('AuthContext: Cleaned up temporary pre-auth document:', preAuthDocSnap.id);
                } catch (err: any) {
                  // If the user's email was pre-registered with a different casing than their Google Auth profile,
                  // deleting the lowercase/exact temp document can sometimes be blocked by security rules for non-admins.
                  // This warning is entirely safe and non-blocking — the main authenticated user profile was already
                  // successfully written and is fully active.
                  console.info(
                    'AuthContext: Pre-auth document cleanup deferred (due to casing/permission bounds). ' +
                    'This is non-blocking — user profile is successfully linked and active.',
                    err.message || err
                  );
                }
              }
              
              profileData = linkedProfile;
            } else {
              // BOOTSTRAP: Only allow the first superadmin to auto-create their profile
              if (resolvedEmail === 'alienwaregl01@gmail.com') {
                console.log('AuthContext: Bootstrapping superadmin profile');
                const newProfile: UserProfile = {
                  uid: user.uid,
                  email: resolvedEmail || '',
                  displayName: user.displayName || '',
                  role: 'superadmin',
                  status: 'active',
                  facilityId: 'default-facility',
                  facilityName: globalFacilityName,
                  createdAt: serverTimestamp()
                };
                await setDoc(docRef, newProfile);
                profileData = newProfile;

                // Seed pricing for bootstrap facility
                const { seedDefaultPricing } = await import('../services/pricingInitialiser');
                seedDefaultPricing('default-facility');
              } else {
                console.warn('AuthContext: No authorized profile found for', resolvedEmail);
                setError('Unauthorized: Your account has not been added to the system. Please contact a Super Admin.');
                await logout();
                setUser(null);
                setProfile(null);
                setLoading(false);
                return;
              }
            }
          }

          if (profileData && profileData.status === 'inactive') {
            console.warn('AuthContext: User is inactive, logging out');
            setError('Access Denied: Your account is currently inactive. Please contact an administrator.');
            await logout();
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }

          setProfile(profileData);
          setError(null);
          console.log('AuthContext: Profile set successfully');
          logAction({ 
            action: 'LOGIN', 
            details: `User ${profileData?.displayName} logged in`,
            facilityId: 'default-facility' 
          });
        } catch (error) {
          console.error('AuthContext: Error in auth user block:', error);
        }
      } else {
        console.log('AuthContext: No Firebase user authenticated');
        try {
          const savedSession = localStorage.getItem('pitch_reviewer_session');
          if (!savedSession) {
            setUser(null);
            setProfile(null);
          }
        } catch {
          setUser(null);
          setProfile(null);
        }
      }
      console.log('AuthContext: Finished processing, setting loading false');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    localStorage.removeItem('pitch_reviewer_session');
    setIsReviewerSession(false);
    await loginWithGoogle();
  };

  const loginAsReviewer = async (identifier = '', password = '') => {
    try {
      setLoading(true);
      setError(null);

      const cleanId = (identifier || '').trim().toLowerCase();
      const cleanPass = (password || '').trim();

      // Strict validation: must match exact reviewer email/identifier and password
      const isIdValid = cleanId === 'reviewer@kingsimaging.org' || cleanId === 'reviewer';
      const isPassValid = cleanPass === 'KingSuperAdmin2026!';

      if (!isIdValid || !isPassValid) {
        const errMsg = 'Invalid reviewer credentials. Please enter the correct email (reviewer@kingsimaging.org) and passcode (KingSuperAdmin2026!).';
        setError(errMsg);
        setLoading(false);
        return { success: false, error: errMsg };
      }

      // Fetch global facility name if available
      let facilityName = "King's Diagnostic Imaging and Research Center";
      try {
        const globalDoc = await getDoc(doc(db, 'systemSettings', 'global'));
        if (globalDoc.exists() && globalDoc.data().facilityName) {
          facilityName = globalDoc.data().facilityName;
        }
      } catch (err) {
        console.warn('AuthContext: Could not fetch global setting for reviewer:', err);
      }

      const reviewerUid = 'reviewer-superadmin';
      const reviewerProfile: UserProfile = {
        uid: reviewerUid,
        email: REVIEWER_CREDENTIALS.email,
        displayName: 'Pitch Reviewer (Super Admin)',
        role: 'superadmin',
        status: 'active',
        facilityId: 'default-facility',
        facilityName,
        systemTheme: 'cyber',
        whatsappEnabled: true,
        emailEnabled: true
      };

      // Persist in localStorage
      localStorage.setItem('pitch_reviewer_session', JSON.stringify(reviewerProfile));

      // Attempt to save/merge in Firestore users collection
      try {
        await setDoc(doc(db, 'users', reviewerUid), reviewerProfile, { merge: true });
      } catch (docErr) {
        console.warn('AuthContext: Firestore setDoc for reviewer (non-blocking):', docErr);
      }

      // Seed pricing for reviewer facility
      try {
        const { seedDefaultPricing } = await import('../services/pricingInitialiser');
        seedDefaultPricing('default-facility');
      } catch (seedErr) {
        console.warn('AuthContext: Seed pricing error for reviewer:', seedErr);
      }

      const reviewerUser = createReviewerUser(reviewerProfile);
      setUser(reviewerUser);
      setProfile(reviewerProfile);
      setIsReviewerSession(true);
      setError(null);
      setLoading(false);

      logAction({
        action: 'LOGIN',
        details: 'Pitch Reviewer authenticated via Super Admin Bypass',
        facilityId: 'default-facility',
        userId: reviewerUid,
        userName: 'Pitch Reviewer (Super Admin)',
        userEmail: REVIEWER_CREDENTIALS.email
      });

      return { success: true };
    } catch (err: any) {
      console.error('AuthContext: Reviewer login failed:', err);
      setError(err.message || 'Reviewer login failed');
      setLoading(false);
      return { success: false, error: err.message };
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('pitch_reviewer_session');
    setIsReviewerSession(false);
    setUser(null);
    setProfile(null);
    setEmulatedRole(null);
    try {
      await logout();
    } catch (err) {
      console.warn('AuthContext: Firebase signOut notice:', err);
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    const updated = { ...profile, ...data };
    setProfile(updated);
    if (isReviewerSession) {
      localStorage.setItem('pitch_reviewer_session', JSON.stringify(updated));
    }
    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, data, { merge: true });
    } catch (err) {
      console.warn('AuthContext: updateProfile Firestore write:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile: effectiveProfile, 
      realProfile: profile,
      loading, 
      error,
      login, 
      loginAsReviewer,
      logout: handleLogout,
      emulateRole: setEmulatedRole,
      isEmulating: !!emulatedRole,
      updateProfile,
      isReviewerSession
    }}>
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
