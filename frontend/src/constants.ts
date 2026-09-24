export const MODALITIES = ["X-Ray", "Ultrasound", "Mammography", "Echo", "ECG"];

export const REGULAR_BODY_PARTS = [
  "Abdomen (KUB)", "Acromioclavicular Joints", "Ankle (Tarsals)", "Calcaneus", "Cervical Spine", 
  "Chest (Thorax)", "Clavicle", "Coccyx", "Elbow", "Facial Bones", "Femur", "Foot (Metatarsals)", 
  "Forearm (Radius/Ulna)", "Hand (Metacarpals)", "Hip Joint", "Humerus", "Knee Joint", 
  "Lower Leg (Tibia/Fibula)", "Lumbar Spine", "Mandible", "Nasal Bones", "Orbits", 
  "Patella", "Pelvis", "Ribs", "Sacroiliac Joints", "Sacrum", "Scapula", "Shoulder (Glenohumeral)", 
  "Sinuses (Paranasal)", "Skull (Cranium)", "Sternoclavicular Joints", "Sternum", 
  "Thoracic Spine", "Upper Arm", "Wrist (Carpals)"
];

export const MAMMOGRAPHY_PROCEDURES = [
  "Mammography (Bilateral)"
];

export const ULTRASOUND_PROCEDURES = [
  "Abdominal Ultrasound",
  "Pelvic Ultrasound",
  "Abdominopelvic Ultrasound",
  "Obstetric Ultrasound",
  "KUB Ultrasound",
  "Prostate Ultrasound",
  "Breast Ultrasound",
  "Thyroid Ultrasound",
  "Scrotal Ultrasound",
  "Doppler Ultrasound (Lower Limb)",
  "Doppler Ultrasound (Upper Limb)",
  "Carotid Doppler Ultrasound",
  "Transvaginal Ultrasound",
  "Musculoskeletal (MSK) Ultrasound",
  "Transfontanelle Ultrasound",
  "Follicular Tracking"
];

export const ECHO_PROCEDURES = [
  "Echocardiography (Adult)",
  "Echocardiography (Pediatric)",
  "Echocardiography (Fetal)",
  "Stress Echocardiography"
];

export const ECG_PROCEDURES = [
  "ECG (12-Lead)"
];

export const BODY_PARTS_LIST = [
  ...REGULAR_BODY_PARTS,
  ...MAMMOGRAPHY_PROCEDURES,
  ...ULTRASOUND_PROCEDURES,
  ...ECHO_PROCEDURES,
  ...ECG_PROCEDURES
];

export const SPECIAL_PROCEDURES = [
  "HSG (Hysterosalpingography)",
  "IVU (Intravenous Urogram)",
  "Barium Swallow",
  "Barium Meal",
  "Barium Enema",
  "Sialography",
  "Cystography",
  "Urethrography",
  "RUG",
  "MCUG",
  "RUG/MCUG",
  "Contrast-Enhanced CT",
  "Contrast-Enhanced MRI"
];

export const ALL_PRICED_ITEMS = [
  ...BODY_PARTS_LIST,
  ...SPECIAL_PROCEDURES
];

export const EXTREMITIES = [
  "Ankle (Tarsals)", "Calcaneus", "Elbow", "Femur", "Foot (Metatarsals)", 
  "Forearm (Radius/Ulna)", "Hand (Metacarpals)", "Hip Joint", "Humerus", "Knee Joint", 
  "Lower Leg (Tibia/Fibula)", "Patella", "Shoulder (Glenohumeral)", 
  "Upper Arm", "Wrist (Carpals)", "Clavicle", "Scapula", "Acromioclavicular Joints"
];

export function isXRayOrMammographyProcedure(proc: any, studyModality?: string): boolean {
  if (!proc && !studyModality) return false;
  
  const procName = typeof proc === 'string' ? proc : (proc?.name || proc?.partName || proc?.procedureName || '');
  const procModality = (typeof proc === 'object' && proc?.modality) ? String(proc.modality).trim() : '';
  const mainModality = (studyModality || '').trim();

  const modLower = (procModality || mainModality).toLowerCase();

  // Check explicit modality codes/strings for X-Ray or Mammography
  const xrayModalityKeywords = ['x-ray', 'xray', 'x ray', 'xr', 'dx', 'cr', 'dr', 'mammography', 'mammo', 'mg', 'radiography', 'general radiography', 'contrast studies'];
  if (xrayModalityKeywords.some(m => modLower.includes(m))) {
    return true;
  }

  const nameLower = procName.toLowerCase();

  // Check if procedure or modality is explicitly Ultrasound, Echo, ECG, CT, or MRI
  const isUltrasound = ULTRASOUND_PROCEDURES.some(p => p.toLowerCase() === nameLower) ||
    nameLower.includes('ultrasound') || nameLower.includes('sonogram') || nameLower.includes('doppler') ||
    modLower === 'us' || modLower === 'ultrasound';

  const isEcho = ECHO_PROCEDURES.some(p => p.toLowerCase() === nameLower) || nameLower.includes('echo') || modLower === 'echo';
  const isECG = ECG_PROCEDURES.some(p => p.toLowerCase() === nameLower) || nameLower.includes('ecg') || modLower === 'ecg';
  const isCTorMRI = modLower === 'ct' || modLower === 'mr' || modLower === 'mri' || nameLower.includes('ct scan') || nameLower.includes('mri');

  if (isUltrasound || isEcho || isECG || isCTorMRI) {
    return false;
  }

  // Any other diagnostic procedure (X-Ray, Mammography, fluoroscopy, extremity, chest, etc.) is permitted for radiographer upload
  return true;
}

