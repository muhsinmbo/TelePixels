import React, { useState, useEffect } from 'react';
import { X, Printer, HeartPulse, ShieldCheck } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface AccessPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id: string;
    name: string;
    requestId?: string;
    accessCode?: string;
  };
  facilityName?: string;
  facilityLogo?: string;
}

export default function AccessPassModal({ isOpen, onClose, patient, facilityName, facilityLogo }: AccessPassModalProps) {
  const { profile } = useAuth();
  const [sysInfo, setSysInfo] = useState({ name: '', logo: '' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemSettings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSysInfo({
          name: data.facilityName || '',
          logo: data.facilityLogo || ''
        });
      }
    });
    return () => unsub();
  }, []);

  const activeFacilityName = (facilityName && facilityName !== 'Medical Facility' && facilityName !== 'Medical Diagnostic Center')
    ? facilityName 
    : (sysInfo.name || profile?.facilityName || "King's Diagnostic Imaging and Research Center");

  const activeFacilityLogo = (facilityLogo && facilityLogo !== '/logo.png') 
    ? facilityLogo 
    : (sysInfo.logo || profile?.facilityLogo || "/logo.png");

  const portalUrl = `${window.location.origin}/portal/${patient.id}/${patient.accessCode}`;
  const displayUrl = `${window.location.host}/portal`;

  const printPass = () => {
    const svg = document.querySelector('#qr-code-pass svg');
    if (!svg) return;

    // Add explicit namespace and dimensions for PDF/Print compatibility
    const svgClone = svg.cloneNode(true) as SVGElement;
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', '240');
    svgClone.setAttribute('height', '240');
    
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const imgSrc = `data:image/svg+xml;base64,${svgBase64}`;
    
    const win = window.open('', '', 'width=900,height=1000');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Access Pass - ${patient.name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 15mm 10mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1a1a1a;
              line-height: 1.4;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #111827;
              padding-bottom: 3mm;
              margin-bottom: 5mm;
            }
            .logo-section {
              display: flex;
              align-items: center;
              gap: 3mm;
            }
            .logo-img {
              width: 10mm;
              height: 10mm;
              object-fit: contain;
            }
            .facility-name {
              font-size: 13pt;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: -0.5px;
              color: #000000;
              line-height: 1.2;
            }
            .facility-sub {
              font-size: 7.5pt;
              text-transform: uppercase;
              font-weight: 600;
              color: #6b7280;
              line-height: 1.2;
            }
            .doc-tag {
              background-color: #111827;
              color: #ffffff;
              padding: 1mm 3mm;
              font-size: 9pt;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .title-banner {
              text-align: center;
              margin-bottom: 5mm;
              padding: 3mm;
              background-color: #f3f4f6;
              border: 1px solid #e5e7eb;
            }
            .title-banner h1 {
              margin: 0;
              font-size: 14pt;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #111827;
            }
            .title-banner p {
              margin: 1mm 0 0 0;
              font-size: 8.5pt;
              color: #4b5563;
              font-weight: 500;
            }
            
            .two-cols {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4mm;
              margin-bottom: 5mm;
            }
            .card {
              border: 1px solid #d1d5db;
              padding: 3.5mm;
              background-color: #ffffff;
            }
            .card-title {
              font-size: 8pt;
              font-weight: bold;
              text-transform: uppercase;
              color: #374151;
              border-bottom: 1.5px solid #111827;
              padding-bottom: 1mm;
              margin-top: 0;
              margin-bottom: 2.5mm;
              letter-spacing: 0.3px;
            }
            .data-row {
              display: flex;
              justify-content: space-between;
              font-size: 9pt;
              margin-bottom: 1.5mm;
            }
            .data-label {
              font-weight: 600;
              color: #4b5563;
              font-size: 8.5pt;
              text-transform: uppercase;
            }
            .data-value {
              font-weight: 700;
              color: #111827;
            }
            .highlight-box {
              background-color: #f9fafb;
              border: 2px solid #111827;
              padding: 3.5mm;
              display: flex;
              gap: 4mm;
              margin-bottom: 5mm;
            }
            .hl-item {
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            .hl-label {
              font-size: 7.5pt;
              font-weight: bold;
              text-transform: uppercase;
              color: #4b5563;
              margin-bottom: 0.5mm;
            }
            .hl-value {
              font-family: monospace;
              font-size: 13pt;
              font-weight: 800;
              color: #111827;
              letter-spacing: 0.5px;
            }
            
            .guide-section {
              margin-bottom: 5mm;
            }
            .guide-title {
              font-size: 10pt;
              font-weight: bold;
              text-transform: uppercase;
              color: #111827;
              border-bottom: 1.5px solid #d1d5db;
              padding-bottom: 1mm;
              margin-bottom: 3mm;
              letter-spacing: 0.2px;
            }
            .steps {
              display: flex;
              flex-direction: column;
              gap: 3mm;
            }
            .step-item {
              display: flex;
              gap: 3mm;
              align-items: flex-start;
            }
            .step-num {
              background-color: #111827;
              color: #ffffff;
              width: 5.5mm;
              height: 5.5mm;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 9pt;
              font-weight: bold;
              flex-shrink: 0;
            }
            .step-content {
              font-size: 9pt;
              color: #1f2937;
            }
            .step-headline {
              font-weight: bold;
              margin-bottom: 0.5mm;
              color: #111827;
              font-size: 9.5pt;
            }
            
            .qr-instruction-block {
              display: grid;
              grid-template-columns: 1fr 35mm;
              gap: 6mm;
              align-items: center;
              border-top: 1px dashed #d1d5db;
              border-bottom: 1px dashed #d1d5db;
              padding: 3.5mm 0;
              margin-bottom: 5mm;
            }
            .qr-label {
              font-size: 9pt;
              font-weight: 600;
              color: #374151;
              line-height: 1.45;
            }
            .qr-label h3 {
              margin: 0 0 1mm 0;
              font-size: 10pt;
              font-weight: bold;
              text-transform: uppercase;
              color: #111827;
            }
            .qr-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .qr-img {
              width: 28mm;
              height: 28mm;
              border: 1px solid #111827;
              padding: 1mm;
              background-color: #ffffff;
            }
            .qr-note {
              font-size: 7pt;
              font-weight: bold;
              text-transform: uppercase;
              margin-top: 1mm;
              color: #1f2937;
            }

            .info-notice {
              background-color: #eff6ff;
              border-left: 4px solid #2563eb;
              padding: 3mm;
              font-size: 8.5pt;
              line-height: 1.4;
              color: #1e3a8a;
              margin-bottom: 5mm;
            }
            .info-notice-title {
              font-weight: bold;
              margin-bottom: 0.5mm;
              text-transform: uppercase;
              font-size: 8.5pt;
              letter-spacing: 0.1px;
            }
            
            .footer {
              border-top: 1px solid #e5e7eb;
              padding-top: 3mm;
              font-size: 7.5pt;
              color: #6b7280;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .footer-bold {
              font-weight: bold;
              color: #374151;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              ${activeFacilityLogo ? `<img src="${activeFacilityLogo}" class="logo-img" />` : ''}
              <div>
                <div class="facility-name">${activeFacilityName}</div>
                <div class="facility-sub">Radiology & Clinical Imaging Department</div>
              </div>
            </div>
            <div class="doc-tag">Secure Document</div>
          </div>

          <div class="title-banner">
            <h1>Patient Access & Image Portal Guide</h1>
            <p>Follow the guidelines below to access your medical imaging, radiographs, and clinical reports.</p>
          </div>

          <div class="card" style="margin-bottom: 5mm;">
            <h2 class="card-title">Patient Profile & Access Validity</h2>
            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 6mm;">
              <div>
                <div class="data-row">
                  <span class="data-label">Patient Name:</span>
                  <span class="data-value">${patient.name}</span>
                </div>
                <div class="data-row">
                  <span class="data-label">Patient ID / MRN:</span>
                  <span class="data-value" style="font-family: monospace;">${patient.id}</span>
                </div>
              </div>
              <div>
                <div class="data-row">
                  <span class="data-label">Issue Date:</span>
                  <span class="data-value">${formatDate(new Date())}</span>
                </div>
                <div class="data-row">
                  <span class="data-label">Access Duration:</span>
                  <span class="data-value" style="color: #2563eb;">Active (90-Day Validity)</span>
                </div>
              </div>
            </div>
          </div>

          <div class="highlight-box">
            <div class="hl-item" style="border-right: 1px solid #d1d5db; padding-right: 20px;">
              <span class="hl-label">1. Medical Record Number (MRN)</span>
              <span class="hl-value">${patient.id}</span>
            </div>
            <div class="hl-item" style="padding-left: 20px;">
              <span class="hl-label">2. Secure Verification Code</span>
              <span class="hl-value" style="color: #2563eb;">${patient.accessCode || 'XXXXXX'}</span>
            </div>
          </div>

          <div class="qr-instruction-block" style="margin-top: 5mm;">
            <div class="qr-label">
              <h3 style="color: #2563eb; display: flex; align-items: center; gap: 1.5mm; margin-bottom: 1.5mm;">
                Method 1: Instant QR Code Scan (Recommended)
              </h3>
              <p style="margin: 0; font-size: 9.5pt; color: #111827; line-height: 1.45; font-weight: 500;">
                <strong>No typing, reading, or spelling required.</strong> Simply open your smartphone camera or any scanning app and point it at the QR code to the right. You will be logged in and redirected to your medical scans automatically in one tap.
              </p>
            </div>
            <div class="qr-container">
              <img src="${imgSrc}" class="qr-img" />
              <div class="qr-note" style="color: #2563eb;">Scan for Instant Login</div>
            </div>
          </div>

          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 3.5mm; font-size: 8.5pt; color: #4b5563; margin-bottom: 5mm; display: flex; align-items: center; gap: 3mm;">
            <div style="font-size: 14pt; line-height: 1;">ℹ️</div>
            <div>
              <strong>Elderly & Caregiver Assistance:</strong> If a family member, caregiver, or clinic assistant is supporting the patient, they can scan the QR code above to fetch and view reports on their behalf effortlessly.
            </div>
          </div>

          <div class="guide-section">
            <h2 class="guide-title" style="color: #4b5563;">Method 2: Manual Web Access (Alternative)</h2>
            <div class="steps">
              <div class="step-item">
                <div class="step-num">1</div>
                <div class="step-content">
                  <div class="step-headline">Open Your Web Browser</div>
                  Navigate to the official Patient Imaging Web Portal: <b style="text-decoration: underline; color: #111827;">https://${window.location.host}/portal</b> on any standard computer, phone, or tablet browser.
                </div>
              </div>
              <div class="step-item">
                <div class="step-num">2</div>
                <div class="step-content">
                  <div class="step-headline">Enter Verification Credentials</div>
                  Provide your unique <b>Medical Record Number (MRN)</b> and <b>Secure Verification Code</b> shown in the boxes above.
                </div>
              </div>
              <div class="step-item">
                <div class="step-num">3</div>
                <div class="step-content">
                  <div class="step-headline">Review and Download Your Scans</div>
                  Once authenticated, you will be able to view high-resolution digital radiographs, read diagnostic/radiology reports, and download clinical imaging files.
                </div>
              </div>
            </div>
          </div>

          <div class="info-notice">
            <div class="info-notice-title">⚠️ Patient Guidance & Privacy Reminder</div>
            Your digital medical scans and reports are protected and confidential. Keep this access pass in a secure place. For the best viewing experience when reading reports or viewing images, we recommend adjusting your computer or phone screen to a comfortable brightness.
          </div>

          <div class="footer">
            <div>
              Generated via <span class="footer-bold">HMS RAD - RIS / PACS Patient Information Platform</span>
            </div>
            <div>
              Access Ref: <span class="footer-bold" style="font-family: monospace;">${(patient.requestId || patient.id).substring(0, 8).toUpperCase()}</span>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 750);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold tracking-tight uppercase text-white">Security Access Pass</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 text-white/70 hover:text-white rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-1 bg-white/5">
              <div className="bg-white text-black p-8 relative overflow-hidden">
                <div className="flex justify-between border-b-2 border-black pb-3 mb-6">
                  <div className="flex items-center gap-4">
                    {activeFacilityLogo && <img src={activeFacilityLogo} alt="Logo" className="w-8 h-8 object-contain" />}
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tighter leading-tight max-w-[250px] text-black">{activeFacilityName}</h3>
                      <p className="text-[10px] font-bold uppercase opacity-40 mt-0.5">Diagnostic Imaging Center</p>
                    </div>
                  </div>
                  <div className="bg-black text-white px-3 py-1 rounded font-bold text-xs uppercase self-start">Access Pass</div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <p className="text-[10px] uppercase font-bold opacity-40 mb-1">Patient MRN</p>
                    <p className="font-mono font-bold text-xl leading-none">{patient.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold opacity-40 mb-1">Passcode</p>
                    <p className="font-mono font-bold text-xl leading-none tracking-widest text-primary">{patient.accessCode || 'XXXXXX'}</p>
                  </div>
                </div>

                <div className="flex gap-6 items-center">
                  <div className="flex-1 space-y-4">
                    <p className="text-[11px] leading-relaxed">
                      Visit <b>{displayUrl}</b> and enter your MRN and Access Code to securely view your images and reports at home.
                    </p>
                    <div className="pt-2">
                      <p className="text-[9px] font-bold uppercase opacity-40">Registered For</p>
                      <p className="text-sm font-bold truncate">{patient.name}</p>
                    </div>
                  </div>

                  <div className="w-32 h-32 p-2 bg-white border border-black/10 rounded-xl" id="qr-code-pass">
                    <QRCodeSVG 
                      value={portalUrl} 
                      size={112}
                      level="H"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-black/10 text-[9px] font-medium opacity-50 flex justify-between">
                  <span>Issued: {formatDate(new Date())}</span>
                  <span className="font-bold">VALID FOR 90 DAYS</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-black/40 flex gap-3">
              <button 
                onClick={printPass}
                className="flex-1 glass-btn bg-primary text-black font-bold h-12 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Printer className="w-5 h-5" />
                Print Access Slip
              </button>
              <button 
                onClick={onClose}
                className="flex-1 glass-btn bg-white/5 border-white/10 py-3 font-bold text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
