import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export type LogAction = 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'PATIENT_INTAKE' 
  | 'STUDY_REQUEST' 
  | 'IMAGE_UPLOAD' 
  | 'REPORT_START' 
  | 'REPORT_FINALIZE' 
  | 'VIEW_STUDY' 
  | 'USER_ROLE_CHANGE'
  | 'USER_DELETE'
  | 'PRICE_APPROVED'
  | 'PATIENT_EDIT'
  | 'PATIENT_EDIT_REQUEST'
  | 'PATIENT_EDIT_APPROVED'
  | 'PATIENT_EDIT_REJECTED'
  | 'SONOGRAPHER_WORKSHEET_SAVE'
  | 'PATIENT_DELETE_REQUEST'
  | 'PATIENT_DELETE_APPROVED'
  | 'PATIENT_DELETE_REJECTED'
  | 'PATIENT_DELETE'
  | 'STUDY_DELETE_REQUEST'
  | 'STUDY_DELETE_APPROVED'
  | 'STUDY_DELETE_REJECTED'
  | 'DATA_EXPORT_FULL'
  | 'PRICING_CONFIG_CHANGE'
  | 'PORTAL_LOGIN'
  | 'PORTAL_LOGOUT'
  | 'PORTAL_VIEW_STUDY'
  | 'PORTAL_DOWNLOAD_IMAGE'
  | 'PORTAL_DOWNLOAD_PDF'
  | 'PORTAL_FEEDBACK';

interface LogParams {
  action: LogAction;
  details: string;
  facilityId?: string;
  targetId?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export async function logAction({ action, details, facilityId, targetId, userId, userName, userEmail }: LogParams) {
  try {
    const user = auth.currentUser;
    if (!user && !userId && !userName) return;

    const logEntry = {
      action,
      details,
      userId: userId || user?.uid || 'anonymous',
      userName: userName || user?.displayName || user?.email || 'Unknown',
      userEmail: userEmail || user?.email || null,
      facilityId: facilityId || 'global',
      targetId: targetId || null,
      timestamp: serverTimestamp(),
    };

    await addDoc(collection(db, 'logs'), logEntry);
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}
