import React, { useState, useEffect } from 'react';
import { collectionGroup, query, where, onSnapshot, getDoc, doc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Clock, CheckCircle, ExternalLink, Loader2, Mail, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn, formatDate, formatGhanaPhoneNumber } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface NotificationItem {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  physicianName?: string;
  physicianPhone?: string;
  physicianEmail?: string;
  receptionistName?: string;
  modalities: string[];
  procedures?: any[];
  completedAt: any;
  accessCode: string;
  facilityId: string;
  notificationSent?: boolean;
  patientNotified?: boolean;
  physicianNotified?: boolean;
}

import DateFilterDropdown, { DateFilterValue } from './DateFilterDropdown';

export default function NotificationCenter() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('today');
  const [sortField, setSortField] = useState<'patientName' | 'completedAt'>('completedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    // Query for completed studies
    const q = query(
      collectionGroup(db, 'requests'),
      where('facilityId', '==', 'default-facility'),
      where('status', 'in', ['Completed', 'completed', 'Finalized', 'finalized']),
      orderBy('completedAt', 'desc')
    );

    const getFilterRange = () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      if (dateFilter === 'yesterday') {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
      } else if (dateFilter === 'week') {
        start.setDate(start.getDate() - 7);
      } else if (dateFilter === 'all') {
        start.setFullYear(2020);
      }
      return { start, end };
    };

    const { start: filterStart, end: filterEnd } = getFilterRange();

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const items: NotificationItem[] = [];
      
      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        
        // Date Filtering
        let completedAtDate: Date;
        if (data.completedAt?.toDate) {
          completedAtDate = data.completedAt.toDate();
        } else {
          completedAtDate = new Date(data.completedAt);
        }

        if (dateFilter !== 'all') {
          if (completedAtDate < filterStart || completedAtDate > filterEnd) continue;
        }

        // Manual filter for notificationSent logic
        // Only hide if patient is notified AND (if physician exists) physician is notified
        const patientNotified = data.patientNotified === true;
        const physicianNotified = data.physicianNotified === true;
        const hasPhysician = !!data.physicianPhone;
        
        if (patientNotified && (!hasPhysician || physicianNotified)) continue;
        
        // Fetch patient phone number if not in the request
        let phone = data.patientPhone;
        if (!phone) {
          try {
            const patientDoc = await getDoc(doc(db, 'patients', data.patientId));
            if (patientDoc.exists()) {
              phone = patientDoc.data().phone;
            }
          } catch (err) {
            console.error('Error fetching patient phone:', err);
          }
        }

        if (phone) {
          phone = formatGhanaPhoneNumber(phone);
        }

        items.push({
          id: docSnapshot.id,
          patientId: data.patientId,
          patientName: data.patientName || 'Unknown',
          patientPhone: phone,
          patientEmail: data.patientEmail,
          physicianName: data.physicianName,
          physicianPhone: data.physicianPhone ? formatGhanaPhoneNumber(data.physicianPhone) : undefined,
          physicianEmail: data.physicianEmail,
          receptionistName: data.receptionistName,
          modalities: data.modalities || [],
          procedures: data.procedures || [],
          completedAt: data.completedAt,
          accessCode: data.accessCode,
          facilityId: data.facilityId,
          notificationSent: data.notificationSent,
          patientNotified: data.patientNotified,
          physicianNotified: data.physicianNotified
        });
      }

      setNotifications(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests-notification-queue');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile?.facilityId, dateFilter]);

  const sendWhatsApp = async (item: NotificationItem, target: 'patient' | 'physician') => {
    const targetPhone = target === 'patient' ? item.patientPhone : item.physicianPhone;
    const targetName = target === 'patient' ? item.patientName : item.physicianName || 'Doctor';
    
    if (!targetPhone) {
      toast.error(`No phone number found for this ${target}.`);
      return;
    }

    setProcessingId(`${item.id}-${target}`);
    try {
      const cleanPhone = targetPhone.replace(/\D/g, '');
      const portalUrl = `${window.location.origin}/portal/${item.patientId}/${item.accessCode}`;
      const receptionistInfo = item.receptionistName ? ` (Sent by ${item.receptionistName})` : '';
      
      const studyTypeLabel = item.procedures && item.procedures.length > 0
        ? item.procedures.map((p: any) => typeof p === 'string' ? p : (p.name || p.partName || p.procedureName || 'Unknown')).join(', ')
        : item.modalities.join(', ');
      
      let message = '';
      if (target === 'patient') {
        message = `*KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE*
Saint Charles Road (Before Attaesibi Hotel), Digital Address NT-0061-5616, Tamale, Ghana
Phone: +233 50 025 2793 / +233 55 058 3106

Hello *${targetName}*,

Your diagnostic results for *${studyTypeLabel}* are ready.

SECURE PATIENT PORTAL ACCESS:
• Portal: ${portalUrl}
• Access Code: *${item.accessCode || 'N/A'}*

Location: Saint Charles Road (Before Attaesibi Hotel), Tamale
Hours: Mon–Fri: 8:30 AM–6:00 PM | Sat: 9:00 AM–6:00 PM | Sun: 10:30 AM–4:00 PM

Thank you for choosing King's Diagnostic Imaging and Research Centre.${receptionistInfo}`;
      } else {
        message = `*KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE*
Tamale Main Workstation Notification

Dear *Dr. ${targetName}*,

The formal diagnostic report for your patient *${item.patientName}* (*${studyTypeLabel}*) is ready.

CASE SUMMARY & CREDENTIALS:
• Patient: *${item.patientName}* (ID: ${item.patientId})
• Procedure: *${studyTypeLabel}*
• Secure Portal: ${portalUrl}
• Access Code: *${item.accessCode || 'N/A'}*

Clinical Desk: +233 50 025 2793 / +233 55 058 3106
Location: Saint Charles Road (Before Attaesibi Hotel), NT-0061-5616, Tamale, Ghana

Thank you for your clinical partnership.
King's Diagnostic Imaging & Research Team${receptionistInfo}`;
      }
      
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');

      // Update Firestore status - Only mark as sent if patient is notified (standard flow)
      // or if physician is notified. 
      const requestRef = doc(db, 'patients', item.patientId, 'requests', item.id);
      
      const updateData: any = {
        notifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (target === 'patient') {
        updateData.patientNotified = true;
      } else {
        updateData.physicianNotified = true;
      }

      // Check if both are now done
      const isPatientDone = target === 'patient' || item.patientNotified;
      const isPhysicianDone = !item.physicianPhone || (target === 'physician' || item.physicianNotified);
      
      if (isPatientDone && isPhysicianDone) {
        updateData.notificationSent = true;
      }

      await updateDoc(requestRef, updateData);

      toast.success(`Notification sent to ${targetName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `patients/${item.patientId}/requests/${item.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const sendEmail = async (item: NotificationItem, target: 'patient' | 'physician') => {
    const targetEmail = target === 'patient' ? item.patientEmail : item.physicianEmail;
    const targetName = target === 'patient' ? item.patientName : item.physicianName || 'Doctor';
    
    if (!targetEmail) {
      toast.error(`No email address found for this ${target}.`);
      return;
    }

    setProcessingId(`${item.id}-email-${target}`);
    try {
      const portalUrl = `${window.location.origin}/portal/${item.patientId}/${item.accessCode}`;
      const receptionistInfo = item.receptionistName ? ` (Sent by ${item.receptionistName})` : '';
      const facilityName = profile?.facilityName || "King's Diagnostic Imaging and Research Center";
      const studyType = item.modalities.join(', ');
      
      let subject = '';
      let body = '';
      
      if (target === 'patient') {
        subject = `Diagnostic Results: ${item.patientName} - King's Diagnostic Imaging`;
        const rawTemplate = profile?.patientEmailTemplate || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
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
{facilityName}`;
        
        const cleanedTemplate = rawTemplate
          .replace(/[┌┐└┘│]/g, '')
          .replace(/─{3,}/g, '----------------------------------------')
          .replace(/⭐\s*Rated\s*4\.8\/5\s*Stars.*$/gm, '')
          .replace(/⭐\s*\*?4\.8\/5★.*$/gm, '')
          .replace(/URGENT:\s*/gi, '')
          .replace(/🔑|▶|📋|🏥|⭐|🗝|🌐|✨/g, '')
          .replace(/Golden Heart Diagnostic Imaging Center/gi, "{facilityName}")
          .replace(/Golden Heart Diagnostic Imaging/gi, "{facilityName}")
          .replace(/Golden Heart/gi, "{facilityName}");

        body = cleanedTemplate
          .replace(/{patientName}/g, item.patientName)
          .replace(/{studyType}/g, studyType)
          .replace(/{physicianName}/g, item.physicianName || 'your referring doctor')
          .replace(/{accessCode}/g, item.accessCode || 'N/A')
          .replace(/{portalUrl}/g, portalUrl)
          .replace(/{facilityName}/g, facilityName) + receptionistInfo;
      } else {
        subject = `Diagnostic Report: ${item.patientName} - ${studyType}`;
        const rawPhysicianTemplate = profile?.physicianEmailTemplate || `KING'S DIAGNOSTIC IMAGING AND RESEARCH CENTRE
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
{facilityName}`;
        
        const cleanedPhysicianTemplate = rawPhysicianTemplate
          .replace(/[┌┐└┘│]/g, '')
          .replace(/─{3,}/g, '----------------------------------------')
          .replace(/⭐\s*Rated\s*4\.8\/5\s*Stars.*$/gm, '')
          .replace(/⭐\s*\*?4\.8\/5★.*$/gm, '')
          .replace(/URGENT:\s*/gi, '')
          .replace(/🔑|▶|📋|🏥|⭐|🗝|🌐|✨/g, '')
          .replace(/Golden Heart Diagnostic Imaging Center/gi, "{facilityName}")
          .replace(/Golden Heart Diagnostic Imaging/gi, "{facilityName}")
          .replace(/Golden Heart/gi, "{facilityName}");

        body = cleanedPhysicianTemplate
          .replace(/{physicianName}/g, item.physicianName || 'Doctor')
          .replace(/{patientName}/g, item.patientName)
          .replace(/{studyType}/g, studyType)
          .replace(/{patientId}/g, item.patientId)
          .replace(/{accessCode}/g, item.accessCode || 'N/A')
          .replace(/{portalUrl}/g, portalUrl)
          .replace(/{facilityName}/g, facilityName) + receptionistInfo;
      }
      
      // Use Gmail Compose link
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${targetEmail}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmailUrl, '_blank');

      // Update Firestore status
      const requestRef = doc(db, 'patients', item.patientId, 'requests', item.id);
      const updateData: any = {
        notifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (target === 'patient') updateData.patientNotified = true;
      else updateData.physicianNotified = true;

      const isPatientDone = target === 'patient' || item.patientNotified;
      const isPhysicianDone = !item.physicianPhone || (target === 'physician' || item.physicianNotified);
      
      if (isPatientDone && isPhysicianDone) {
        updateData.notificationSent = true;
      }

      await updateDoc(requestRef, updateData);
      toast.success(`Email link opened for ${targetName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `patients/${item.patientId}/requests/${item.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getRelativeTimeClass = (timestamp: any) => {
    if (!timestamp) return 'text-muted';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (hours > 4) return 'text-danger font-bold animate-pulse';
    if (hours > 1) return 'text-accent font-bold';
    return 'text-success';
  };

  const handleSort = (field: 'patientName' | 'completedAt') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedNotifications = [...notifications].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'patientName') {
      comparison = a.patientName.localeCompare(b.patientName);
    } else if (sortField === 'completedAt') {
      const dateA = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : (a.completedAt ? new Date(a.completedAt).getTime() : 0);
      const dateB = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : (b.completedAt ? new Date(b.completedAt).getTime() : 0);
      comparison = dateA - dateB;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getSortIcon = (field: 'patientName' | 'completedAt') => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
  };

  if (loading) {
    return (
      <div className="glass-panel p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden border-2 border-primary/10">
      <div className="p-6 border-b border-white/5 bg-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/20 text-success">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Notification Center</h2>
            <p className="text-[10px] text-muted uppercase font-black tracking-widest mt-0.5">Report Delivery Queue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DateFilterDropdown 
            value={dateFilter} 
            onChange={setDateFilter} 
            className="mr-2"
          />
          <span className="text-xs font-bold bg-white/5 px-2 py-1 rounded border border-white/10">
            {notifications.length} Pending
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/20 text-[10px] uppercase font-black tracking-widest text-muted">
              <th 
                className="px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => handleSort('patientName')}
              >
                <div className="flex items-center gap-2">
                  Patient
                  {getSortIcon('patientName')}
                </div>
              </th>
              <th className="px-6 py-4">Procedures</th>
              <th 
                className="px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => handleSort('completedAt')}
              >
                <div className="flex items-center gap-2">
                  Ready Since
                  {getSortIcon('completedAt')}
                </div>
              </th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {sortedNotifications.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <CheckCircle className="w-8 h-8" />
                      <p className="text-sm font-medium">All reports notified!</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedNotifications.map((item) => (
                  <motion.tr
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="group hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold">{item.patientName}</span>
                        <span className="text-[10px] font-mono text-muted">{item.patientId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {item.procedures && item.procedures.length > 0 ? (
                          item.procedures.map((p, idx) => (
                            <span key={idx} className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">
                              {typeof p === 'string' ? p : (p.name || p.partName)}
                            </span>
                          ))
                        ) : (
                          item.modalities.map((m, idx) => (
                            <span key={idx} className="text-[9px] font-bold bg-white/10 text-muted px-1.5 py-0.5 rounded uppercase">
                              {m}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className={cn("w-3 h-3", getRelativeTimeClass(item.completedAt))} />
                        <span className={cn("text-xs font-medium", getRelativeTimeClass(item.completedAt))}>
                          {item.completedAt ? formatDate(item.completedAt) : 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => sendWhatsApp(item, 'patient')}
                          disabled={processingId === `${item.id}-patient`}
                          title={item.patientNotified ? 'Patient Notified via WhatsApp' : 'Notify Patient via WhatsApp'}
                          className={cn(
                            "inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-lg",
                            item.patientNotified 
                              ? "bg-slate-700 text-slate-300 opacity-60" 
                              : "bg-success text-black hover:bg-success/90 hover:scale-110 active:scale-90",
                            "disabled:opacity-50"
                          )}
                        >
                          {processingId === `${item.id}-patient` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            item.patientNotified ? <CheckCircle className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />
                          )}
                        </button>

                        {item.patientEmail && (
                          <button
                            onClick={() => sendEmail(item, 'patient')}
                            disabled={processingId === `${item.id}-email-patient`}
                            title={item.patientNotified ? 'Patient Notified via Email' : 'Email Patient'}
                            className={cn(
                              "inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-lg",
                              item.patientNotified 
                                ? "bg-slate-700 text-slate-300 opacity-60" 
                                : "bg-primary text-black hover:bg-primary/90 hover:scale-110 active:scale-90",
                              "disabled:opacity-50"
                            )}
                          >
                            {processingId === `${item.id}-email-patient` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {item.physicianPhone && (
                          <button
                            onClick={() => sendWhatsApp(item, 'physician')}
                            disabled={processingId === `${item.id}-physician`}
                            title={item.physicianNotified ? 'Doctor Notified via WhatsApp' : 'Notify Doctor via WhatsApp'}
                            className={cn(
                              "inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-lg",
                              item.physicianNotified 
                                ? "bg-slate-700 text-slate-300 opacity-60" 
                                : "bg-primary text-black hover:bg-primary/90 hover:scale-110 active:scale-90",
                              "disabled:opacity-50"
                            )}
                          >
                            {processingId === `${item.id}-physician` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              item.physicianNotified ? <CheckCircle className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {item.physicianEmail && (
                          <button
                            onClick={() => sendEmail(item, 'physician')}
                            disabled={processingId === `${item.id}-email-physician`}
                            title={item.physicianNotified ? 'Doctor Notified via Email' : 'Email Doctor'}
                            className={cn(
                              "inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-lg",
                              item.physicianNotified 
                                ? "bg-slate-700 text-slate-300 opacity-60" 
                                : "bg-accent text-white hover:bg-accent/90 hover:scale-110 active:scale-90",
                              "disabled:opacity-50"
                            )}
                          >
                            {processingId === `${item.id}-email-physician` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      
      {notifications.length > 0 && (
        <div className="p-4 bg-black/40 text-center">
          <p className="text-[9px] text-muted uppercase font-bold tracking-tighter">
            Clicking notify will open WhatsApp and mark the report as delivered to the patient.
          </p>
        </div>
      )}
    </div>
  );
}
