import React, { useState } from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { 
  User, 
  Bell, 
  Building2, 
  Palette, 
  Shield, 
  Save, 
  CheckCircle,
  Mail,
  MessageCircle,
  Loader2,
  Banknote
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { doc, updateDoc, setDoc, onSnapshot, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error Info: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

export default function Settings() {
  const { profile, updateProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'facility' | 'appearance'>('profile');
  const [globalPricingEnabled, setGlobalPricingEnabled] = useState(false);

  React.useEffect(() => {
    if (!profile) return;
    const unsubscribeGlobalSettings = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalPricingEnabled(snapshot.data().allowFacilityAccess || false);
      }
    });

    const unsubscribeSystemGlobal = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.portalTheme) {
          setFormData(prev => ({ ...prev, portalTheme: data.portalTheme }));
        }
      }
    });

    return () => {
      unsubscribeGlobalSettings();
      unsubscribeSystemGlobal();
    };
  }, [profile]);

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

  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    email: profile?.email || '',
    facilityName: cleanLegacyText(profile?.facilityName) || "KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE",
    facilityLetterhead: profile?.facilityLetterhead || '',
    facilityLogo: profile?.facilityLogo || '/logo.png',
    whatsappEnabled: profile?.whatsappEnabled ?? true,
    emailEnabled: profile?.emailEnabled ?? true,
    patientEmailTemplate: cleanLegacyText(profile?.patientEmailTemplate) || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
Saint Charles Road, Digital Address NT-0061-5616, Tamale, Northern Region, Ghana
Contact: +233 50 025 2793 / +233 55 058 3106

Dear {patientName},

Your clinical results for ({studyType}) have been thoroughly reviewed and finalized by our diagnostic team at {facilityName}.

Your secure digital patient portal is active. You can view, print, or download your official report and imaging records using the credentials below:

SECURE PATIENT PORTAL ACCESS:
• Online Portal: {portalUrl}
• Access Key: {accessCode}

For security, please do not share this link with unauthorized persons.

NEXT STEPS & MEDICAL CONTINUITY:
To ensure optimal healthcare management, please schedule a follow-up appointment with your referring doctor to discuss these diagnostic findings.

FACILITY & CONTACT DETAILS:
• Address: Saint Charles Road (Before Attaesibi Hotel), Digital Address: NT-0061-5616, Tamale, Northern Region, Ghana
• Phone / Inquiries: +233 50 025 2793 / +233 55 058 3106
• Operating Hours: Mon – Fri: 8:30 AM – 6:00 PM | Sat: 9:00 AM – 6:00 PM | Sun: 10:30 AM – 4:00 PM
• Services: General Diagnostic Imaging, Ultrasound, Breast Imaging, Laboratory Investigations, Health Screenings, Medical Research Support

Thank you for choosing {facilityName}.

Warmest regards,

Clinical Operations & Patient Support Desk
{facilityName}`,
    physicianEmailTemplate: cleanLegacyText(profile?.physicianEmailTemplate) || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
Clinical Portal Notification

Dear Dr. {physicianName},

We are pleased to inform you that the diagnostic imaging and professional report for your patient, {patientName}, have been completed at {facilityName}.

CLINICAL INTAKE SUMMARY:
• Patient Name: {patientName}
• Patient ID:   {patientId}
• Study Type:   {studyType}

SECURE ACCESS CREDENTIALS:
• Secure Portal: {portalUrl}
• Case Access Key: {accessCode}

ABOUT OUR DIAGNOSTIC CENTRE:
{facilityName} (Tamale Main) provides accredited diagnostic imaging, ultrasound, breast imaging, laboratory investigations, and medical research support.
• Location: Saint Charles Road (Before Attaesibi Hotel), Digital Address: NT-0061-5616, Tamale, Northern Region, Ghana
• Contact Phone: +233 50 025 2793 / +233 55 058 3106
• Operating Hours: Mon–Fri: 8:30 AM–6:00 PM | Sat: 9:00 AM–6:00 PM | Sun: 10:30 AM–4:00 PM

Thank you for your ongoing clinical partnership.

With clinical regards,

The Diagnostic Team
{facilityName}`,
    radiologistEmailTemplate: cleanLegacyText(profile?.radiologistEmailTemplate) || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
Radiology Reporting Assignment

Dear Dr. {radiologistName},

A new diagnostic study has been successfully acquired, processed, and uploaded to the workstation. This case is triaged and awaiting your clinical interpretation and formal sign-offs.

CASE DETAIL SHEET:
• Patient Name: {patientName}
• Study Type:   {studyType}

WORKLIST LINK:
You can review, examine, and report directly on your Worklist portal:
{reportingUrl}

FACILITY & WORKSTATION DESK:
{facilityName} (Tamale Main)
Official Location: Saint Charles Road (Before Attaesibi Hotel), Digital Address NT-0061-5616, Tamale, Northern Region, Ghana
Official Contact Lines: +233 50 025 2793 / +233 55 058 3106
Operating Hours: Mon–Fri: 8:30 AM–6:00 PM | Sat: 9:00 AM–6:00 PM | Sun: 10:30 AM–4:00 PM

Thank you for your expertise and for being a part of the {facilityName} Clinical Team.

Warm regards,

Administrative Desk
{facilityName}`,
    systemTheme: profile?.systemTheme || 'cyber',
    portalTheme: 'teleradiology' as 'cyber' | 'teleradiology',
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save to user profile
      try {
        await updateProfile({ 
          displayName: formData.displayName,
          facilityName: formData.facilityName,
          facilityLetterhead: formData.facilityLetterhead,
          facilityLogo: formData.facilityLogo,
          whatsappEnabled: formData.whatsappEnabled,
          emailEnabled: formData.emailEnabled,
          patientEmailTemplate: formData.patientEmailTemplate,
          physicianEmailTemplate: formData.physicianEmailTemplate,
          radiologistEmailTemplate: formData.radiologistEmailTemplate,
          systemTheme: formData.systemTheme as 'cyber' | 'teleradiology',
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${profile?.uid}`);
      }

      // If superadmin, also save to global settings and propagate to all users
      if (profile?.role === 'superadmin') {
        const globalPath = 'systemSettings/global';
        try {
          const globalRef = doc(db, globalPath);
          await setDoc(globalRef, { 
            portalTheme: formData.portalTheme,
            facilityName: formData.facilityName,
            facilityLetterhead: formData.facilityLetterhead,
            facilityLogo: formData.facilityLogo,
            updatedAt: serverTimestamp(),
            updatedBy: profile.uid
          }, { merge: true });

          // Propagate new facilityName to all users in the system
          try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const batchPromises = usersSnap.docs.map(userDoc => {
              const uData = userDoc.data();
              if (uData.facilityName !== formData.facilityName) {
                return updateDoc(userDoc.ref, { facilityName: formData.facilityName });
              }
              return null;
            }).filter(Boolean);
            if (batchPromises.length > 0) {
              await Promise.all(batchPromises);
            }
          } catch (propagateErr) {
            console.warn('Failed to propagate facilityName to all users:', propagateErr);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, globalPath);
        }
      }

      toast.success(`${profile?.role === 'superadmin' ? 'System' : 'Profile'} settings updated`);
    } catch (error) {
      console.error('Error updating settings:', error);
      // The handleFirestoreError re-throws, so we'll see the details in console.
      // We don't want to show the JSON to the user though.
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.startsWith('{')) {
        const info = JSON.parse(errorMsg);
        toast.error(`Permission Denied: ${info.operationType} on ${info.path}`);
      } else {
        toast.error('Failed to update settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell, roles: ['superadmin', 'facilityadmin', 'receptionist'] },
    { id: 'facility', label: 'Facility', icon: Building2, roles: ['superadmin', 'facilityadmin'] },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ].filter(tab => !tab.roles || (profile && tab.roles.includes(profile.role as UserRole)));

  const handleLetterheadUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        toast.error('Letterhead image must be less than 500KB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, facilityLetterhead: reader.result as string }));
        toast.success('Letterhead uploaded to draft');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200 * 1024) {
        toast.error('Logo image must be less than 200KB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, facilityLogo: reader.result as string }));
        toast.success('Logo uploaded to draft');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-main flex items-center gap-3">
            <Shield className="text-main w-8 h-8" />
            System <span className="text-main font-light">Settings</span>
          </h1>
          <p className="text-main mt-1 opacity-70">Configure your account and application preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="glass-button flex items-center justify-center w-12 h-12 bg-primary text-black font-bold rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(var(--color-primary),0.3)]"
          title="Save Changes"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
                activeTab === tab.id 
                  ? "bg-primary/20 text-main font-bold border border-primary/30" 
                  : "text-main hover:bg-white/5 opacity-60"
              )}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <div className="glass-panel p-8 space-y-8">
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center gap-6 pb-6 border-b border-white/10">
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">
                    {formData.displayName?.[0] || formData.email?.[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Profile Picture</h3>
                    <p className="text-sm text-muted">A uniquely generated avatar based on your name</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-muted font-medium ml-1">Full Name</label>
                    <input
                      type="text"
                      className="glass-input w-full"
                      value={formData.displayName}
                      onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                      placeholder="Enter your name"
                    />
                  </div>
                  <div className="space-y-2 opacity-60">
                    <label className="text-sm text-muted font-medium ml-1">Email Address (Read-only)</label>
                    <input
                      type="email"
                      className="glass-input w-full cursor-not-allowed"
                      value={formData.email}
                      readOnly
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted font-medium ml-1">Account Role</label>
                  <div className="px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-sm font-mono text-main font-bold flex items-center gap-2 capitalize">
                    <Shield className="w-4 h-4" />
                    {profile?.role}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-8">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold">Alert Channels</h3>
                  <p className="text-sm text-muted">Select how patients and physicians should be notified</p>
                </div>

                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/10 group hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-success/20 rounded-xl text-success">
                        <MessageCircle size={24} />
                      </div>
                      <div>
                        <p className="font-bold underline-offset-4 group-hover:underline">WhatsApp API Integration</p>
                        <p className="text-sm text-muted">Send automated links via wa.me API</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.whatsappEnabled}
                        onChange={(e) => setFormData(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/10 group hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/20 rounded-xl text-primary">
                        <Mail size={24} />
                      </div>
                      <div>
                        <p className="font-bold underline-offset-4 group-hover:underline">Gmail Notification Links</p>
                        <p className="text-sm text-muted">Generate pre-filled report links for Gmail</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.emailEnabled}
                        onChange={(e) => setFormData(prev => ({ ...prev, emailEnabled: e.target.checked }))}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-main flex items-center gap-2">
                       <Mail size={16} />
                       Patient Email Template
                    </h4>
                    <textarea 
                      className="glass-input w-full h-32 text-sm font-sans"
                      value={formData.patientEmailTemplate}
                      onChange={(e) => setFormData(prev => ({ ...prev, patientEmailTemplate: e.target.value }))}
                      placeholder="Use {patientName}, {accessCode}, {portalUrl}, {facilityName}"
                    />
                  </div>

                  {(profile?.role === 'superadmin' || profile?.role === 'facilityadmin') && (
                    <>
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-main flex items-center gap-2 opacity-80">
                          <Mail size={16} />
                          Radiologist Alert Template
                        </h4>
                        <textarea 
                          className="glass-input w-full h-32 text-sm font-sans"
                          value={formData.radiologistEmailTemplate}
                          onChange={(e) => setFormData(prev => ({ ...prev, radiologistEmailTemplate: e.target.value }))}
                          placeholder="Use {radiologistName}, {patientName}, {studyType}, {reportingUrl}"
                        />
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-main flex items-center gap-2 opacity-80">
                          <Mail size={16} />
                          Physician Email Template
                        </h4>
                        <textarea 
                          className="glass-input w-full h-32 text-sm font-sans"
                          value={formData.physicianEmailTemplate}
                          onChange={(e) => setFormData(prev => ({ ...prev, physicianEmailTemplate: e.target.value }))}
                          placeholder="Use {physicianName}, {patientName}, {patientId}, {accessCode}, {portalUrl}, {facilityName}"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-start gap-3">
                  <div className="flex items-center justify-center mt-0.5">
                    <BrandLogo type="icon" className="w-4 h-4" />
                  </div>
                  <p className="text-xs leading-relaxed text-main/80">
                    <span className="font-bold text-primary mr-1">Pro Tip:</span> 
                    Gmail notifications use manual browser-triggered links and are completely free. You can use standard placeholders like <code className="text-primary">{"{patientName}"}</code> which will be replaced automatically.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'facility' && (
              <div className="space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted font-medium ml-1">Facility Name</label>
                    <input
                      type="text"
                      className="glass-input w-full"
                      value={formData.facilityName}
                      onChange={(e) => setFormData(prev => ({ ...prev, facilityName: e.target.value }))}
                    />
                  </div>
                  <p className="text-xs text-muted italic">This name appears on all receipts, access passes, and report headers.</p>
                </div>

                <div className="pt-6 border-t border-white/10 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-main">
                      <Palette className="w-5 h-5" />
                      Facility Logo
                    </h3>
                    <p className="text-sm text-main opacity-70">Upload a square logo for receipts and access slips (Max 200KB)</p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex items-center justify-center p-2 group relative">
                      {formData.facilityLogo ? (
                        <>
                          <img src={formData.facilityLogo} alt="Logo" className="w-full h-full object-contain" />
                          <button 
                            onClick={() => setFormData(prev => ({ ...prev, facilityLogo: '' }))}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-danger text-[10px] font-bold"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <Palette className="w-8 h-8 text-muted" />
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <label className="glass-btn bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl cursor-pointer text-sm font-bold inline-block transition-all">
                        Upload Logo
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                      <p className="text-[10px] text-muted italic leading-relaxed">
                        Best results with a transparent background PNG.<br />
                        Recommended size: 200x200px.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-main">
                      <Palette className="w-5 h-5" />
                      Report Letterhead
                    </h3>
                    <p className="text-sm text-main opacity-70">Upload a custom letterhead for PDF reports (Max 500KB)</p>
                  </div>

                  <div className="space-y-4">
                    {formData.facilityLetterhead ? (
                      <div className="relative group overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        <img 
                          src={formData.facilityLetterhead} 
                          alt="Letterhead Preview" 
                          className="w-full h-32 object-contain p-2"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                           <label className="cursor-pointer glass-btn bg-white/20 hover:bg-white/30 px-3 py-1 text-xs">
                             Change Image
                             <input type="file" className="hidden" accept="image/*" onChange={handleLetterheadUpload} />
                           </label>
                           <button 
                             onClick={() => setFormData(prev => ({ ...prev, facilityLetterhead: '' }))}
                             className="glass-btn bg-danger/20 hover:bg-danger/30 text-danger px-3 py-1 text-xs"
                           >
                             Remove
                           </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-2xl bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all cursor-pointer group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Palette className="w-8 h-8 text-muted group-hover:text-primary mb-2 transition-colors" />
                          <p className="text-sm text-muted">Click to upload letterhead image</p>
                          <p className="text-[10px] text-muted/60 mt-1">PNG, JPG recommended (Landscape proportions)</p>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLetterheadUpload} />
                      </label>
                    )}
                    <p className="text-[10px] text-muted italic">If no custom letterhead is uploaded, a professional default layout will be generated.</p>
                  </div>
                </div>

                {profile?.role === 'superadmin' && (
                  <div className="pt-8 border-t border-white/10 space-y-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-main flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Admin Controls
                      </h3>
                      <p className="text-sm text-main opacity-70">Global system overrides for all facility modules</p>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/20 group hover:border-primary/40 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 rounded-xl text-primary">
                          <Banknote size={24} />
                        </div>
                        <div>
                          <p className="font-bold underline-offset-4 group-hover:underline">Procedure Pricing Module</p>
                          <p className="text-sm text-muted">Allow facility admins to manage and propose pricing</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={globalPricingEnabled}
                          onChange={async (e) => {
                            try {
                              const nextVal = e.target.checked;
                              await setDoc(doc(db, 'settings', 'pricing'), {
                                allowFacilityAccess: nextVal,
                                updatedAt: serverTimestamp(),
                                updatedBy: profile?.uid
                              }, { merge: true });
                              toast.success(`Pricing module ${nextVal ? 'activated' : 'deactivated'} globally`);
                            } catch (err) {
                              toast.error('Failed to update global pricing state');
                            }
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold">Personal Theme Preference</h3>
                    <p className="text-sm text-muted">Choose the interface style that you find most comfortable for your work.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Cyber Theme Option */}
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, systemTheme: 'cyber' }))}
                      className={cn(
                        "group relative p-6 rounded-2xl border-2 transition-all text-left overflow-hidden",
                        formData.systemTheme === 'cyber' ? "border-primary bg-primary/5 shadow-2xl shadow-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                      )}
                    >
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-2 rounded-lg bg-primary/20 text-primary">
                            <Shield size={24} />
                          </div>
                          {formData.systemTheme === 'cyber' && (
                            <CheckCircle className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <h4 className="font-bold text-main text-lg mb-1">Cyber Aesthetic</h4>
                        <p className="text-xs text-muted leading-relaxed">Modern dark mode with neon highlights and glassmorphism effects.</p>
                      </div>
                    </button>

                    {/* Teleradiology Theme Option */}
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, systemTheme: 'teleradiology' }))}
                      className={cn(
                        "group relative p-6 rounded-2xl border-2 transition-all text-left overflow-hidden",
                        formData.systemTheme === 'teleradiology' ? "border-primary bg-primary/5 shadow-2xl shadow-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                      )}
                    >
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-2 rounded-lg bg-[#967E2B]/20 text-[#967E2B]">
                            <Building2 size={24} />
                          </div>
                          {formData.systemTheme === 'teleradiology' && (
                            <CheckCircle className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <h4 className="font-bold text-main text-lg mb-1">Professional Clinical</h4>
                        <p className="text-xs text-muted leading-relaxed">High-contrast grey and white theme optimized for medical imaging review.</p>
                      </div>
                    </button>
                  </div>
                </div>

                {profile?.role === 'superadmin' && (
                  <div className="pt-12 border-t border-white/10 space-y-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">Patient Portal Global Brand</h3>
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">System Wide</span>
                      </div>
                      <p className="text-sm text-muted">Select the default interface aesthetic for patients accessing their results.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, portalTheme: 'cyber' }))}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-left",
                          formData.portalTheme === 'cyber' ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                        )}
                      >
                        <div className="font-bold text-main">Cyber Dark Portal</div>
                        <div className="text-xs text-muted italic">Preferred for modern diagnostic brands</div>
                      </button>

                      <button
                        onClick={() => setFormData(prev => ({ ...prev, portalTheme: 'teleradiology' }))}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-left",
                          formData.portalTheme === 'teleradiology' ? "border-[#967E2B] bg-[#967E2B]/10 shadow-[0_0_15px_rgba(150,126,43,0.1)]" : "border-white/10 bg-white/5 hover:border-white/20"
                        )}
                      >
                        <div className="font-bold text-main">Professional Grey Portal</div>
                        <div className="text-xs text-muted italic">Preferred for clinical healthcare networks</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
