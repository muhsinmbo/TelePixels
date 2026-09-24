import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { generateId, cn, formatGhanaPhoneNumber } from '../lib/utils';
import { UserPlus, ClipboardList, Printer, Search, X, Banknote, Activity, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { logAction } from '../services/loggerService';
import ReceiptModal from '../components/ReceiptModal';

interface PriceConfig {
  partName: string;
  price: number;
  currency: string;
}

import { MODALITIES, BODY_PARTS_LIST, SPECIAL_PROCEDURES, EXTREMITIES, REGULAR_BODY_PARTS, MAMMOGRAPHY_PROCEDURES, ULTRASOUND_PROCEDURES, ECHO_PROCEDURES, ECG_PROCEDURES } from '../constants';

export default function PatientIntake() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastRegisteredPatient, setLastRegisteredPatient] = useState<any>(null);
  const [bodyPartSearch, setBodyPartSearch] = useState('');
  const [pricing, setPricing] = useState<PriceConfig[]>([]);
  const [expandSpecialProcedures, setExpandSpecialProcedures] = useState(false);
  const [facilityInfo, setFacilityInfo] = useState({ name: '', logo: '', letterhead: '' });
  
  React.useEffect(() => {
    const facilityId = 'default-facility';
    console.log('PatientIntake: Listening to pricing for facility:', facilityId);
    
    const q = collection(db, 'facilities', facilityId, 'pricing');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as PriceConfig);
      console.log('PatientIntake: Received pricing data:', data.length, 'items');
      setPricing(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `facilities/${facilityId}/pricing`);
    });

    const unsubscribeGlobal = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setFacilityInfo({
          name: data.facilityName || '',
          logo: data.facilityLogo || '',
          letterhead: data.facilityLetterhead || ''
        });
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeGlobal();
    };
  }, []);

  const [patientData, setPatientData] = useState({
    id: generateId('MRN'),
    name: '',
    age: '',
    gender: 'Male',
    phone: '',
    address: '',
    email: '',
    physicianName: '',
    physicianPhone: '',
    physicianEmail: '',
  });

  const [activeModality, setActiveModality] = useState<string | null>(null);

  const getModalityForProcedure = (part: string): string => {
    if (MAMMOGRAPHY_PROCEDURES.includes(part)) return 'Mammography';
    if (ULTRASOUND_PROCEDURES.includes(part)) return 'Ultrasound';
    if (ECHO_PROCEDURES.includes(part)) return 'Echo';
    if (ECG_PROCEDURES.includes(part)) return 'ECG';
    return 'X-Ray';
  };

  const [requestData, setRequestData] = useState({
    modalities: [] as string[],
    selectedParts: [] as { name: string, laterality: 'Left' | 'Right' | 'Both' | 'None', needsReport?: boolean, modality: string }[],
    clinicalInfo: '',
    priority: 'routine',
    needsReport: false,
  });

  const handlePatientChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPatientData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleModality = (mod: string) => {
    const isSelected = requestData.modalities.includes(mod);
    
    if (isSelected) {
      if (activeModality === mod || (!activeModality && requestData.modalities[0] === mod)) {
        // Toggle OFF completely
        const nextMods = requestData.modalities.filter(m => m !== mod);
        const nextActive = nextMods.length > 0 ? nextMods[0] : null;
        setActiveModality(nextActive);
        setRequestData(prev => {
          const nextParts = prev.selectedParts.filter(p => {
            const partModality = p.modality || getModalityForProcedure(p.name);
            return partModality !== mod;
          });
          return {
            ...prev,
            modalities: nextMods,
            selectedParts: nextParts
          };
        });
      } else {
        // Just make active (switch views)
        setActiveModality(mod);
      }
    } else {
      // Toggle ON
      setActiveModality(mod);
      setRequestData(prev => ({
        ...prev,
        modalities: [...prev.modalities, mod]
      }));
    }
    
    setBodyPartSearch('');
  };

  const toggleBodyPart = (part: string, modality?: string) => {
    setRequestData(prev => {
      const isSelected = prev.selectedParts.some(p => p.name === part);
      const determinedModality = modality || getModalityForProcedure(part);
      const newParts = isSelected
        ? prev.selectedParts.filter(p => p.name !== part)
        : [...prev.selectedParts, { name: part, laterality: 'None' as const, modality: determinedModality }];
      return { ...prev, selectedParts: newParts };
    });
  };

  const updatePartLaterality = (partName: string, lat: 'Left' | 'Right' | 'Both' | 'None') => {
    setRequestData(prev => ({
      ...prev,
      selectedParts: prev.selectedParts.map(p => 
        p.name === partName ? { ...p, laterality: lat } : p
      )
    }));
  };

  const togglePartReport = (partName: string) => {
    setRequestData(prev => ({
      ...prev,
      selectedParts: prev.selectedParts.map(p => 
        p.name === partName ? { ...p, needsReport: !p.needsReport } : p
      )
    }));
  };

  const isMammography = requestData.modalities.includes('Mammography');
  const isUltrasound = requestData.modalities.includes('Ultrasound');
  const isXray = requestData.modalities.includes('X-Ray');

  const getModalityThemeConfig = (mod: string) => {
    if (mod === 'Mammography') {
      return {
        badgeText: 'Mammography Selected',
        container: 'bg-rose-500/5 border-rose-500/60 border-2 shadow-[0_0_20px_rgba(244,63,94,0.15)]',
        selectedItem: 'bg-rose-500 text-white border-rose-600 font-extrabold scale-[1.02] shadow-[0_4px_12px_rgba(244,63,94,0.45)]',
        unselectedItem: 'bg-white/80 text-slate-900 border-slate-300 font-bold hover:bg-white',
        badge: 'bg-rose-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse shadow-[0_2px_8px_rgba(244,63,94,0.4)]',
        priceSelected: 'text-black/80',
        priceUnselected: 'text-slate-700',
        checkColor: 'text-white'
      };
    }
    if (mod === 'Ultrasound') {
      return {
        badgeText: 'Ultrasound Selected',
        container: 'bg-emerald-500/5 border-emerald-500/60 border-2 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
        selectedItem: 'bg-emerald-500 text-white border-emerald-600 font-extrabold scale-[1.02] shadow-[0_4px_12px_rgba(16,185,129,0.45)]',
        unselectedItem: 'bg-white/80 text-slate-900 border-slate-300 font-bold hover:bg-white',
        badge: 'bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse shadow-[0_2px_8px_rgba(16,185,129,0.4)]',
        priceSelected: 'text-black/80',
        priceUnselected: 'text-slate-700',
        checkColor: 'text-white'
      };
    }
    if (mod === 'X-Ray') {
      return {
        badgeText: 'X-Ray Selected',
        container: 'bg-indigo-500/5 border-indigo-500/60 border-2 shadow-[0_0_20px_rgba(79,70,229,0.15)]',
        selectedItem: 'bg-indigo-500 text-white border-indigo-600 font-extrabold scale-[1.02] shadow-[0_4px_12px_rgba(79,70,229,0.45)]',
        unselectedItem: 'bg-white/80 text-slate-900 border-slate-300 font-bold hover:bg-white',
        badge: 'bg-indigo-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse shadow-[0_2px_8px_rgba(79,70,229,0.4)]',
        priceSelected: 'text-black/80',
        priceUnselected: 'text-slate-700',
        checkColor: 'text-white'
      };
    }
    if (mod === 'Echo') {
      return {
        badgeText: 'Echo Selected',
        container: 'bg-cyan-500/5 border-cyan-500/60 border-2 shadow-[0_0_20px_rgba(6,182,212,0.15)]',
        selectedItem: 'bg-cyan-500 text-black border-cyan-600 font-extrabold scale-[1.02] shadow-[0_4px_12px_rgba(6,182,212,0.45)]',
        unselectedItem: 'bg-white/80 text-slate-900 border-slate-300 font-bold hover:bg-white',
        badge: 'bg-cyan-500 text-black text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse shadow-[0_2px_8px_rgba(6,182,212,0.4)]',
        priceSelected: 'text-black/80',
        priceUnselected: 'text-slate-700',
        checkColor: 'text-black'
      };
    }
    if (mod === 'ECG') {
      return {
        badgeText: 'ECG Selected',
        container: 'bg-fuchsia-500/5 border-fuchsia-500/60 border-2 shadow-[0_0_20px_rgba(217,70,239,0.15)]',
        selectedItem: 'bg-fuchsia-500 text-white border-fuchsia-600 font-extrabold scale-[1.02] shadow-[0_4px_12px_rgba(217,70,239,0.45)]',
        unselectedItem: 'bg-white/80 text-slate-900 border-slate-300 font-bold hover:bg-white',
        badge: 'bg-fuchsia-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse shadow-[0_2px_8px_rgba(217,70,239,0.4)]',
        priceSelected: 'text-white/80',
        priceUnselected: 'text-slate-700',
        checkColor: 'text-white'
      };
    }
    return {
      badgeText: '',
      container: 'bg-black/20 border-white/10',
      selectedItem: 'bg-primary/20 text-primary border-primary/30',
      unselectedItem: 'bg-white/5 border-transparent text-muted hover:bg-white/10',
      badge: '',
      priceSelected: 'opacity-80',
      priceUnselected: 'opacity-80',
      checkColor: 'text-primary'
    };
  };

  const getThemeConfig = () => {
    if (isMammography) {
      return getModalityThemeConfig('Mammography');
    }
    if (isUltrasound) {
      return getModalityThemeConfig('Ultrasound');
    }
    if (isXray) {
      return getModalityThemeConfig('X-Ray');
    }
    return getModalityThemeConfig('default');
  };

  const themeConfig = getThemeConfig();

  const currentActiveModality = activeModality || (requestData.modalities.length > 0 ? requestData.modalities[0] : null);

  const pricingNotInLists = pricing.filter(p => 
    !BODY_PARTS_LIST.includes(p.partName) && 
    !SPECIAL_PROCEDURES.includes(p.partName)
  ).map(p => p.partName);

  // If active modality is X-Ray, show special procedures too
  const showSpecialProcedures = currentActiveModality === 'X-Ray';

  const filteredSpecialProcedures = showSpecialProcedures 
    ? [...SPECIAL_PROCEDURES, ...pricingNotInLists].filter(part => 
        part.toLowerCase().includes(bodyPartSearch.toLowerCase())
      )
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientData.name || !patientData.id) {
      toast.error('Please fill in patient name and ID');
      return;
    }

    setLoading(true);
    try {
      // 1. Create/Update Patient
      const formattedPhone = formatGhanaPhoneNumber(patientData.phone);
      const formattedPhysicianPhone = patientData.physicianPhone ? formatGhanaPhoneNumber(patientData.physicianPhone) : '';
      
      const patientRef = doc(db, 'patients', patientData.id);
      const accessCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 2. Imaging request reference (need ID early for patient doc)
      const requestsRef = collection(db, 'patients', patientData.id, 'requests');
      const requestDocRef = doc(requestsRef); // Generate ID before write
      
      const proceduresWithPrice = requestData.selectedParts.map(partObj => {
        const config = pricing.find(p => p.partName === partObj.name);
        const isExtremity = EXTREMITIES.includes(partObj.name);
        const multiplier = (partObj.laterality === 'Both' && isExtremity) ? 2 : 1;
        
        // Mandatory Sonographer Report requirement fee (always GHS 50 if the procedure is Ultrasound)
        const isPartUltrasound = partObj.modality === 'Ultrasound' || ULTRASOUND_PROCEDURES.includes(partObj.name);
        const sonographerFee = isPartUltrasound ? 50 : 0;

        // No Radiologist reporting fee or report requirement for Ultrasound procedures (reporting fee is 0 and needsReport is false)
        const reportingFee = isPartUltrasound ? 0 : ((requestData.needsReport && partObj.needsReport) ? 50 : 0);
        
        return {
          name: partObj.name,
          laterality: partObj.laterality,
          modality: partObj.modality || getModalityForProcedure(partObj.name),
          price: (config?.price || 0) * multiplier + reportingFee + sonographerFee,
          basePrice: (config?.price || 0) * multiplier,
          reportingFee: reportingFee,
          sonographerFee: sonographerFee,
          needsReport: isPartUltrasound ? false : !!(requestData.needsReport && partObj.needsReport),
          currency: 'GHS'
        };
      });

      const totalCost = proceduresWithPrice.reduce((acc, curr) => acc + curr.price, 0);

      await setDoc(patientRef, {
        ...patientData,
        phone: formattedPhone,
        physicianPhone: formattedPhysicianPhone,
        email: patientData.email,
        physicianEmail: patientData.physicianEmail,
        age: Number(patientData.age),
        lastBodyParts: requestData.selectedParts.map(p => p.name).join(', '),
        lastProcedures: proceduresWithPrice,
        lastTotalCost: totalCost,
        lastRequestId: requestDocRef.id,
        lastAccessCode: accessCode,
        facilityId: 'default-facility',
        facilityName: profile?.facilityName || 'Main Facility',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const hasAnyRadiologistReport = proceduresWithPrice.some(p => p.needsReport);

      // 2. Create Imaging Request
      await setDoc(requestDocRef, {
        ...requestData,
        needsReport: hasAnyRadiologistReport,
        id: requestDocRef.id,
        patientId: patientData.id,
        patientName: patientData.name,
        facilityId: 'default-facility',
        facilityName: profile?.facilityName || 'Main Facility',
        patientAge: Number(patientData.age),
        patientGender: patientData.gender,
        patientPhone: formattedPhone,
        patientEmail: patientData.email,
        physicianName: patientData.physicianName,
        physicianPhone: formattedPhysicianPhone,
        physicianEmail: patientData.physicianEmail,
        receptionistName: profile?.displayName || 'Unknown',
        receptionistId: profile?.uid,
        status: 'pending',
        notificationSent: false,
        patientNotified: false,
        physicianNotified: false,
        accessCode: accessCode,
        procedures: proceduresWithPrice,
        totalCost: totalCost,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      logAction({
        action: 'PATIENT_INTAKE',
        details: `Registered new patient: ${patientData.name} (${patientData.id})`,
        facilityId: 'default-facility'
      });

      logAction({
        action: 'STUDY_REQUEST',
        details: `Created ${requestData.modalities.join(', ')} request for patient ${patientData.id}`,
        facilityId: 'default-facility'
      });

      toast.success('Patient registered and request created!');
      
      setLastRegisteredPatient({ 
        ...patientData, 
        age: Number(patientData.age),
        bodyParts: requestData.selectedParts.map(p => p.name).join(', '),
        procedures: proceduresWithPrice,
        totalCost: totalCost,
        requestId: requestDocRef.id,
        accessCode: accessCode
      });
      setShowReceiptModal(true);
      // Don't navigate immediately so they can print
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${patientData.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 w-full transition-all duration-300">
      <div>
        <h1 className="text-3xl font-bold">Patient Intake</h1>
        <p className="text-muted">Register a new patient and create an imaging request.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Patient Info */}
        <div className="glass-panel p-8">
          <div className="flex items-center gap-3 mb-6">
            <UserPlus className="text-primary w-6 h-6" />
            <h2 className="text-xl font-bold">Patient Information</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="patient-id" className="text-sm text-muted">Patient ID</label>
              <div className="flex gap-2">
                <input 
                  id="patient-id"
                  name="id"
                  value={patientData.id}
                  onChange={handlePatientChange}
                  className="glass-input flex-1"
                  placeholder="ID"
                />
                <button 
                  type="button"
                  onClick={() => setPatientData(prev => ({ ...prev, id: generateId('MRN') }))}
                  className="glass-btn bg-white/5 text-xs"
                >
                  Regen
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-name" className="text-sm text-muted">Full Name</label>
              <input 
                id="patient-name"
                name="name"
                value={patientData.name}
                onChange={handlePatientChange}
                className="glass-input w-full"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-age" className="text-sm text-muted">Age</label>
              <input 
                id="patient-age"
                name="age"
                type="number"
                value={patientData.age}
                onChange={handlePatientChange}
                className="glass-input w-full"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-gender" className="text-sm text-muted">Gender</label>
              <select 
                id="patient-gender"
                name="gender"
                value={patientData.gender}
                onChange={handlePatientChange}
                className="glass-input w-full"
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-phone" className="text-sm text-muted">Phone</label>
              <input 
                id="patient-phone"
                name="phone"
                value={patientData.phone}
                onChange={handlePatientChange}
                onBlur={(e) => setPatientData(prev => ({ ...prev, phone: formatGhanaPhoneNumber(e.target.value) }))}
                className="glass-input w-full"
                placeholder="e.g. 0244123456"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-address" className="text-sm text-muted">Address</label>
              <input 
                id="patient-address"
                name="address"
                value={patientData.address}
                onChange={handlePatientChange}
                className="glass-input w-full"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="patient-email" className="text-sm text-muted">Patient Email (Optional)</label>
              <input 
                id="patient-email"
                name="email"
                type="email"
                value={patientData.email}
                onChange={handlePatientChange}
                className="glass-input w-full"
                placeholder="patient@email.com"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="physician-name" className="text-sm text-muted">Requesting Physician (Optional)</label>
              <input 
                id="physician-name"
                name="physicianName"
                value={patientData.physicianName}
                onChange={handlePatientChange}
                className="glass-input w-full"
                placeholder="Dr. Name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="physician-phone" className="text-sm text-muted">Physician Phone (Optional)</label>
              <input 
                id="physician-phone"
                name="physicianPhone"
                value={patientData.physicianPhone}
                onChange={handlePatientChange}
                onBlur={(e) => setPatientData(prev => ({ ...prev, physicianPhone: formatGhanaPhoneNumber(e.target.value) }))}
                className="glass-input w-full"
                placeholder="e.g. 0244123456"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="physician-email" className="text-sm text-muted">Physician Email (Optional)</label>
              <input 
                id="physician-email"
                name="physicianEmail"
                type="email"
                value={patientData.physicianEmail}
                onChange={handlePatientChange}
                className="glass-input w-full"
                placeholder="doctor@email.com"
              />
            </div>
          </div>
        </div>

        {/* Request Info */}
        <div className="glass-panel p-8">
          <div className="flex items-center gap-3 mb-6">
            <ClipboardList className="text-primary w-6 h-6" />
            <h2 className="text-xl font-bold">Imaging Request</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm text-muted">Select Modalities</label>
              <div className="flex flex-wrap gap-2">
                {MODALITIES.map(mod => {
                  const isSelected = requestData.modalities.includes(mod);
                  let selectedClass = "bg-primary text-black";
                  if (mod === 'X-Ray') {
                    selectedClass = "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 shadow-[0_4px_12px_rgba(79,70,229,0.3)] font-black border";
                  } else if (mod === 'Mammography') {
                    selectedClass = "bg-rose-600 text-white border-rose-500 hover:bg-rose-700 shadow-[0_4px_12px_rgba(244,63,94,0.3)] font-black border";
                  } else if (mod === 'Ultrasound') {
                    selectedClass = "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700 shadow-[0_4px_12px_rgba(16,185,129,0.3)] font-black border";
                  } else if (mod === 'Echo') {
                    selectedClass = "bg-cyan-600 text-black border-cyan-500 hover:bg-cyan-700 shadow-[0_4px_12px_rgba(6,182,212,0.3)] font-black border";
                  } else if (mod === 'ECG') {
                    selectedClass = "bg-fuchsia-600 text-white border-fuchsia-500 hover:bg-fuchsia-700 shadow-[0_4px_12px_rgba(217,70,239,0.3)] font-black border";
                  }
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => toggleModality(mod)}
                      className={cn(
                        "glass-btn text-sm transition-all duration-200",
                        isSelected ? selectedClass : "bg-white/5 text-muted hover:bg-white/10"
                      )}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>
            </div>

            {requestData.modalities.length > 0 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <label htmlFor="body-part-search" className="text-sm font-bold flex items-center gap-2">
                            Select Procedures
                          </label>
                        </div>
                        <div className="relative group">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors" />
                          <input 
                            id="body-part-search"
                            name="bodyPartSearch"
                            value={bodyPartSearch}
                            onChange={e => setBodyPartSearch(e.target.value)}
                            className="glass-input text-xs py-1.5 pl-9 w-48 focus:w-64 transition-all"
                            placeholder="Search procedures..."
                          />
                        </div>
                      </div>

                      {requestData.modalities.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                          <span className="text-[10px] text-muted font-bold uppercase tracking-wider pl-1">Selecting for:</span>
                          <div className="flex flex-wrap gap-1">
                            {requestData.modalities.map(mod => {
                              const isActive = currentActiveModality === mod;
                              let activeStyle = "bg-primary text-black font-extrabold";
                              if (mod === 'X-Ray') activeStyle = "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-[0_0_10px_rgba(79,70,229,0.2)] font-black";
                              else if (mod === 'Mammography') activeStyle = "bg-rose-600/30 text-rose-300 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.2)] font-black";
                              else if (mod === 'Ultrasound') activeStyle = "bg-emerald-600/30 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)] font-black";
                              else if (mod === 'Echo') activeStyle = "bg-cyan-600/30 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)] font-black";
                              else if (mod === 'ECG') activeStyle = "bg-fuchsia-600/30 text-fuchsia-300 border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.2)] font-black";
                              
                              return (
                                <button
                                  key={mod}
                                  type="button"
                                  onClick={() => setActiveModality(mod)}
                                  className={cn(
                                    "px-3 py-1 rounded-lg text-[10px] uppercase tracking-wider border transition-all duration-200",
                                    isActive ? activeStyle : "bg-transparent text-muted hover:text-white border-transparent"
                                  )}
                                >
                                  {mod}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-5 max-h-[480px] overflow-y-auto pr-1">
                      {currentActiveModality && (() => {
                        const mod = currentActiveModality;
                        const configTerm = getModalityThemeConfig(mod);
                        let procs: string[] = [];
                        if (mod === 'Mammography') procs = MAMMOGRAPHY_PROCEDURES;
                        else if (mod === 'Ultrasound') procs = ULTRASOUND_PROCEDURES;
                        else if (mod === 'Echo') procs = ECHO_PROCEDURES;
                        else if (mod === 'ECG') procs = ECG_PROCEDURES;
                        else if (mod === 'X-Ray') procs = REGULAR_BODY_PARTS;
                        
                        const filteredProcs = procs.filter(part => 
                          part.toLowerCase().includes(bodyPartSearch.toLowerCase())
                        );

                        return (
                          <div key={mod} className="space-y-2">
                            <div className="flex items-center gap-2 pl-1">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                                {mod === 'X-Ray' ? 'A. X-Ray Body Parts / Regular Studies' : `${mod} Procedures`}
                              </span>
                              {configTerm.badgeText && (
                                <span className={configTerm.badge}>
                                  {mod}
                                </span>
                              )}
                            </div>
                            
                            <div className={cn(
                              "glass-panel p-3 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 transition-all border-2",
                              configTerm.container
                            )}>
                              {filteredProcs.map(part => {
                                const config = pricing.find(p => p.partName === part);
                                const isSelected = requestData.selectedParts.some(p => p.name === part);
                                const activePrice = config?.price || 0;
                                
                                return (
                                  <button
                                    key={part}
                                    type="button"
                                    onClick={() => toggleBodyPart(part, mod)}
                                    className={cn(
                                      "flex flex-col gap-0.5 p-2 rounded-lg text-left transition-all border min-h-[54px]",
                                      isSelected ? configTerm.selectedItem : configTerm.unselectedItem
                                    )}
                                  >
                                    <span className="text-[10px] truncate leading-tight font-medium">{part}</span>
                                    <span className={cn(
                                      "text-[9px] font-mono",
                                      isSelected ? configTerm.priceSelected : configTerm.priceUnselected
                                    )}>
                                      GHS {activePrice.toFixed(2)}
                                    </span>
                                  </button>
                                );
                              })}
                              {filteredProcs.length === 0 && (
                                <div className="col-span-full py-6 text-center text-xs text-muted italic">
                                  No procedures found matching your search.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {showSpecialProcedures && (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => setExpandSpecialProcedures(!expandSpecialProcedures)}
                          className="flex items-center justify-between w-full p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/10 group"
                        >
                          <div className="flex items-center gap-2">
                             <div className={cn(
                               "w-6 h-6 rounded-md flex items-center justify-center transition-all",
                               expandSpecialProcedures ? "bg-primary text-black" : "bg-white/10 text-muted"
                             )}>
                               {expandSpecialProcedures ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                             </div>
                             <span className="text-[10px] text-primary font-black uppercase tracking-widest">B. Special & Contrast Procedures (X-Ray)</span>
                          </div>
                          {requestData.selectedParts.some(p => SPECIAL_PROCEDURES.includes(p.name) || pricingNotInLists.includes(p.name)) && !expandSpecialProcedures && (
                            <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                              {requestData.selectedParts.filter(p => SPECIAL_PROCEDURES.includes(p.name) || pricingNotInLists.includes(p.name)).length} Selected
                            </span>
                          )}
                        </button>

                        <AnimatePresence>
                          {expandSpecialProcedures && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "circOut" }}
                              className="overflow-hidden"
                            >
                              <div className={cn(
                                "glass-panel p-3 max-h-64 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 border-2 mt-2",
                                getModalityThemeConfig('X-Ray').container
                              )}>
                                  {filteredSpecialProcedures.map(part => {
                                    const config = pricing.find(p => p.partName === part);
                                    const isSelected = requestData.selectedParts.some(p => p.name === part);
                                    const activePrice = config?.price || 0;
                                    const xrayTheme = getModalityThemeConfig('X-Ray');
                                    
                                    return (
                                      <button
                                        key={part}
                                        type="button"
                                        onClick={() => toggleBodyPart(part, 'X-Ray')}
                                        className={cn(
                                          "flex flex-col gap-0.5 p-2 rounded-lg text-left transition-all border",
                                          isSelected ? xrayTheme.selectedItem : xrayTheme.unselectedItem
                                        )}
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <span className="text-[10px] leading-tight font-bold">{part}</span>
                                          {isSelected && <CheckCircle className={cn("w-3 h-3", xrayTheme.checkColor)} />}
                                        </div>
                                        <span className={cn(
                                          "text-[9px] font-mono",
                                          isSelected ? xrayTheme.priceSelected : xrayTheme.priceUnselected
                                        )}>
                                          GHS {activePrice.toFixed(2)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                {filteredSpecialProcedures.length === 0 && (
                                  <div className="col-span-full py-4 text-center text-[10px] text-muted italic">
                                    No special procedures found matching your search.
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted">Selected Summary & Laterality</label>
                      <div className="space-y-4">
                        {requestData.selectedParts.length > 0 ? (
                          MODALITIES.map(mod => {
                            const partsForMod = requestData.selectedParts.filter(p => {
                              const partModality = p.modality || getModalityForProcedure(p.name);
                              return partModality === mod;
                            });

                            if (partsForMod.length === 0) return null;

                            const modTheme = getModalityThemeConfig(mod);

                            return (
                              <div key={mod} className="space-y-2 border-l-2 pl-3 border-white/10">
                                <div className="flex items-center gap-1.5 py-1">
                                  <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md", modTheme.badge)}>
                                    {mod}
                                  </span>
                                  <span className="text-[9px] text-muted font-bold font-mono">
                                    {partsForMod.length} selected
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {partsForMod.map(partObj => {
                                    const isExtremity = EXTREMITIES.includes(partObj.name);
                                    return (
                                      <div key={partObj.name} className="glass-panel p-3 bg-white/5 border border-white/10 space-y-3">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-primary">{partObj.name}</span>
                                          <button 
                                            type="button" 
                                            onClick={() => toggleBodyPart(partObj.name, mod)}
                                            className="p-1 hover:bg-white/10 rounded-full transition-colors"
                                          >
                                            <X className="w-4 h-4 text-muted" />
                                          </button>
                                        </div>
                                        
                                        {isExtremity && (
                                          <div className="space-y-2">
                                            <p className="text-[9px] text-muted uppercase font-bold tracking-wider">Select Laterality</p>
                                            <div className="grid grid-cols-4 gap-1.5">
                                              {['Left', 'Right', 'Both', 'None'].map(lat => (
                                                <button
                                                  key={lat}
                                                  type="button"
                                                  onClick={() => updatePartLaterality(partObj.name, lat as any)}
                                                  className={cn(
                                                    "py-1.5 rounded text-[10px] font-bold transition-all border",
                                                    partObj.laterality === lat 
                                                      ? "bg-primary text-black border-primary" 
                                                      : "bg-black/20 text-muted border-white/5 hover:bg-white/5"
                                                  )}
                                                >
                                                  {lat}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {(partObj.modality === 'Ultrasound' || ULTRASOUND_PROCEDURES.includes(partObj.name)) && (
                                          <div className="flex items-center gap-3 p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 mt-2">
                                            <div className="w-4 h-4 rounded border bg-emerald-500 border-emerald-500 text-white flex items-center justify-center shrink-0">
                                              <CheckCircle className="w-3 h-3 text-black" />
                                            </div>
                                            <div className="flex-1">
                                              <p className="text-[10px] font-black uppercase text-emerald-400">Sonographer Report Requirement</p>
                                              <p className="text-[8px] text-muted">Mandatory Fee: + GHS 50.00</p>
                                            </div>
                                          </div>
                                        )}

                                        {!(partObj.modality === 'Ultrasound' || ULTRASOUND_PROCEDURES.includes(partObj.name)) && requestData.needsReport && (
                                          <div 
                                            className={cn(
                                              "flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer mt-2",
                                              partObj.needsReport ? "bg-primary/10 border-primary/20" : "bg-black/20 border-white/5"
                                            )}
                                            onClick={() => togglePartReport(partObj.name)}
                                          >
                                            <div className={cn(
                                              "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                              partObj.needsReport ? "bg-primary border-primary text-black" : "border-white/20"
                                            )}>
                                              {partObj.needsReport && <CheckCircle className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1">
                                              <p className="text-[10px] font-bold uppercase">Report Required</p>
                                              <p className="text-[8px] text-muted">+ GHS 50.00 Radiologist Fee</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="glass-panel p-6 bg-white/5 border border-dashed border-white/10 text-center">
                            <span className="text-muted text-xs italic">No procedures selected</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-muted uppercase font-black tracking-widest">Estimated Total</span>
                          <p className="text-xl font-mono text-primary font-bold">
                            GHS {
                              requestData.selectedParts
                                .reduce((acc, partObj) => {
                                  const config = pricing.find(p => p.partName === partObj.name);
                                  const isExtremity = EXTREMITIES.includes(partObj.name);
                                  const multiplier = (partObj.laterality === 'Both' && isExtremity) ? 2 : 1;
                                  const isPartUltrasound = partObj.modality === 'Ultrasound' || ULTRASOUND_PROCEDURES.includes(partObj.name);
                                  const reportingFee = isPartUltrasound ? 0 : ((requestData.needsReport && partObj.needsReport) ? 50 : 0);
                                  const sonographerFee = isPartUltrasound ? 50 : 0;
                                  return acc + ((config?.price || 0) * multiplier) + reportingFee + sonographerFee;
                                }, 0)
                                .toFixed(2)
                            }
                          </p>
                        </div>
                        <Banknote className="w-8 h-8 text-primary/20" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="clinical-info" className="text-sm text-muted">Clinical Information</label>
              <textarea 
                id="clinical-info"
                name="clinicalInfo"
                value={requestData.clinicalInfo}
                onChange={e => setRequestData(prev => ({ ...prev, clinicalInfo: e.target.value }))}
                className="glass-input w-full h-24 resize-none"
                placeholder="Reason for study, symptoms, etc."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-primary/5 rounded-2xl border-2 border-primary/20 shadow-xl">
               <div className="space-y-4">
                <label className="text-xs font-black text-primary uppercase tracking-widest block pl-1">Priority Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {['routine', 'urgent', 'STAT'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setRequestData(prev => ({ ...prev, priority: p }))}
                      className={cn(
                        "py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                        requestData.priority === p 
                          ? "bg-primary text-black border-primary shadow-lg" 
                          : "bg-black/40 border-white/5 text-muted hover:border-white/20"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-center">
                {(!isUltrasound || requestData.modalities.some(m => m !== 'Ultrasound')) && (
                  <>
                    <label className="text-xs font-black text-primary uppercase tracking-widest block pl-1 mb-2">Radiologist Report Requirement</label>
                    <div 
                      className={cn(
                        "flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer group shadow-2xl relative overflow-hidden",
                        requestData.needsReport 
                          ? "bg-primary/20 border-primary" 
                          : "bg-black/80 border-white/5"
                      )}
                      onClick={() => {
                        const nextVal = !requestData.needsReport;
                        setRequestData(prev => ({ 
                          ...prev, 
                          needsReport: nextVal,
                          selectedParts: prev.selectedParts.map(p => ({
                            ...p,
                            needsReport: nextVal ? (ULTRASOUND_PROCEDURES.includes(p.name) ? false : (p.needsReport ?? true)) : false
                          }))
                        }));
                      }}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-inner",
                        requestData.needsReport ? "bg-primary text-black" : "bg-white/5 text-muted"
                      )}>
                        {requestData.needsReport ? <CheckCircle className="w-8 h-8" /> : <X className="w-8 h-8 opacity-40" />}
                      </div>
                      <div className="flex-1">
                        <p className={cn(
                          "text-sm font-black uppercase tracking-tight",
                          requestData.needsReport ? "text-primary" : "text-white/40"
                        )}>
                          {requestData.needsReport ? "YES - Report Required" : "NO - Upload Only"}
                        </p>
                        <p className="text-[10px] font-bold text-muted leading-tight mt-0.5">
                          {requestData.needsReport 
                            ? "Adds study to the radiologist's reporting queue." 
                            : "Record will be completed immediately after upload."}
                        </p>
                      </div>
                      {!requestData.needsReport && (
                        <div className="absolute top-0 right-0 p-2 opacity-5 italic text-[8px] font-bold">DEFAULT (SKIP)</div>
                      )}
                    </div>
                  </>
                )}
                {isUltrasound && (
                  <p className="text-[10px] text-emerald-400 font-bold mt-2 leading-relaxed bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <strong>Ultrasound Modality Selected:</strong> Ultrasound procedures go directly as sonographer worksheet reports. They never go to the radiologist, and are completed by the sonographer.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button 
            type="button"
            onClick={() => navigate('/patients')}
            className="glass-btn bg-white/5 hover:bg-white/10"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="glass-btn bg-primary text-black font-bold px-8 hover:bg-primary/80"
          >
            {loading ? 'Registering...' : 'Register & Create Request'}
          </button>
        </div>
      </form>

      {showReceiptModal && lastRegisteredPatient && (
        <ReceiptModal 
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            navigate('/patients');
          }}
          patient={lastRegisteredPatient}
          facilityName={facilityInfo.name}
          facilityLogo={facilityInfo.logo}
        />
      )}
    </div>
  );
}
