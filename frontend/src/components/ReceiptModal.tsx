import React, { useState, useEffect } from 'react';
import { X, Printer, HeartPulse, QrCode, Key } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    phone?: string;
    facilityId?: string;
    bodyParts?: string;
    laterality?: string;
    procedures?: Array<{ name: string; price: number; currency: string; laterality?: string }>;
    totalCost?: number;
    requestId?: string;
    accessCode?: string;
  };
  facilityName?: string;
  facilityLogo?: string;
}

export default function ReceiptModal({ isOpen, onClose, patient, facilityName, facilityLogo }: ReceiptModalProps) {
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

  const receiptRef = React.useMemo(() => {
    return Math.random().toString(36).substring(7).toUpperCase();
  }, [patient.id]);

  const printReceipt = () => {
    const currentDate = formatDate(new Date());

    const win = window.open('', '', 'width=450,height=800');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>${patient.name} - Receipt</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0mm;
            }
            @media print {
              html, body {
                width: 80mm;
                margin: 0 !important;
                padding: 0 !important;
                background-color: #ffffff;
              }
              .receipt-paper {
                width: 80mm !important;
                padding: 5mm 5mm 8mm 5mm !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                display: block !important;
              }
            }
            html, body {
              width: 80mm;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10pt;
              line-height: 1.4;
              color: #000;
              display: block;
            }
            .receipt-paper {
              width: 80mm;
              padding: 5mm 5mm 8mm 5mm;
              box-sizing: border-box;
              background-color: #ffffff;
            }
            .align-center { text-align: center; }
            .align-right { text-align: right; }
            .bold { font-weight: bold; }
            
            .header-block {
              text-align: center;
              margin-bottom: 4mm;
            }
            .facility-logo {
              width: 15mm;
              height: 15mm;
              object-fit: contain;
              margin-bottom: 2mm;
              filter: grayscale(100%);
            }
            .facility-title {
              font-size: 11pt;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .receipt-banner {
              text-align: center;
              font-size: 10pt;
              font-weight: bold;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
              padding: 2mm 0;
              margin: 3.5mm 0;
              text-transform: uppercase;
            }
            .dash-line {
              border-top: 1px dashed #000;
              margin: 3mm 0;
              height: 0;
            }
            .double-dash-line {
              border-top: 3px double #000;
              margin: 3mm 0;
              height: 0;
            }
            
            .row-kv {
              display: flex;
              justify-content: space-between;
              margin-bottom: 1.5mm;
            }
            .row-kv .lbl {
              text-transform: uppercase;
              font-weight: bold;
              padding-right: 2mm;
              white-space: nowrap;
            }
            .row-kv .val {
              text-align: right;
              word-break: break-all;
            }

            .item-list {
              margin-top: 2.5mm;
            }
            .item-header {
              display: flex;
              justify-content: space-between;
              font-weight: bold;
              text-transform: uppercase;
              border-bottom: 1px dashed #000;
              padding-bottom: 1.5mm;
              margin-bottom: 2mm;
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2mm;
              align-items: flex-start;
            }
            .item-desc {
              flex: 1;
              padding-right: 2mm;
              word-break: break-word;
            }
            .item-spec {
              font-size: 8.5pt;
              text-transform: uppercase;
              margin-top: 0.5mm;
              display: block;
            }
            .item-val {
              white-space: nowrap;
            }
            
            .total-block {
              font-size: 12pt;
              font-weight: bold;
              display: flex;
              justify-content: space-between;
              margin-top: 3mm;
              padding-top: 1mm;
            }

            .access-container {
              border: 1px solid #000;
              padding: 3mm;
              margin: 5mm 0;
              text-align: center;
            }
            .access-title {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
              margin-bottom: 2mm;
              letter-spacing: 0.5px;
            }
            .access-code-box {
              font-size: 14pt;
              font-weight: bold;
              letter-spacing: 2px;
              margin-bottom: 2.5mm;
            }
            .qr-wrapper {
              display: flex;
              justify-content: center;
              margin: 3mm 0;
            }
            .footer-notes {
              text-align: center;
              font-size: 8.5pt;
              margin-top: 6mm;
              line-height: 1.45;
            }
          </style>
        </head>
        <body>
          <div class="receipt-paper">
            <div class="header-block">
              ${activeFacilityLogo ? `<img src="${activeFacilityLogo}" class="facility-logo" />` : ''}
              <div class="facility-title">${activeFacilityName}</div>
              <div style="font-size: 7.5pt; font-weight: bold; margin-top: 1mm; line-height: 1.2;">Saint Charles Road (Before Attaesibi Hotel)<br/>Digital Address NT-0061-5616, Tamale, Northern Region, Ghana</div>
              <div style="font-size: 7.5pt; margin-top: 0.5mm;">Contact: +233 50 025 2793 / +233 55 058 3106</div>
            </div>
            
            <div class="receipt-banner">Registration Receipt</div>

            <div class="row-kv">
              <span class="lbl">Date:</span>
              <span class="val">${currentDate}</span>
            </div>
            <div class="row-kv">
              <span class="lbl">Patient ID:</span>
              <span class="val bold">${patient.id}</span>
            </div>
            <div class="row-kv">
              <span class="lbl">Patient Name:</span>
              <span class="val bold">${patient.name}</span>
            </div>
            <div class="row-kv">
              <span class="lbl">Age/Gender:</span>
              <span class="val">${patient.age} / ${patient.gender}</span>
            </div>
            ${patient.phone ? `
            <div class="row-kv">
              <span class="lbl">Contact:</span>
              <span class="val">${patient.phone}</span>
            </div>
            ` : ''}

            <div class="dash-line"></div>

            <div class="item-list">
              <div class="item-header">
                <span>Description</span>
                <span>Amount</span>
              </div>
              
              ${(patient.procedures && patient.procedures.length > 0) ? 
                patient.procedures.map(p => `
                  <div class="item-row">
                    <span class="item-desc">
                      ${p.name}
                      ${p.laterality && p.laterality !== 'None' ? `<span class="item-spec">Side: ${p.laterality}</span>` : ''}
                    </span>
                    <span class="item-val bold">${p.currency || 'GHS'} ${p.price.toFixed(2)}</span>
                  </div>
                `).join('') : `
                <div class="item-row">
                  <span class="item-desc">${patient.bodyParts || 'General Imaging'}</span>
                  <span class="item-val bold">GHS ${patient.totalCost?.toFixed(2) || '0.00'}</span>
                </div>
              `}
            </div>

            <div class="double-dash-line"></div>

            <div class="total-block">
              <span>TOTAL PAID</span>
              <span>GHS ${patient.totalCost?.toFixed(2) || '0.00'}</span>
            </div>



            <div class="footer-notes">
              <div class="bold">Thank you for your trust!</div>
              <div style="font-size: 7.5pt; margin-top: 1mm;">HMS RAD - RIS/PACS Platform</div>
              <div style="font-size: 7pt; font-family: monospace; opacity: 0.7; margin-top: 2mm;">Ref: ${receiptRef}</div>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const QrCodeSvg = () => (
    <svg 
      width="72" 
      height="72" 
      viewBox="0 0 29 29" 
      style={{ imageRendering: 'pixelated', fill: '#000000' }} 
      className="mx-auto block"
    >
      <path d="M0,0 h7 v7 h-7 z M1,1 h5 v5 h-5 z M2,2 h3 v3 h-3 z" />
      <path d="M22,0 h7 v7 h-7 z M23,1 h5 v5 h-5 z M24,2 h3 v3 h-3 z" />
      <path d="M0,22 h7 v7 h-7 z M1,23 h5 v5 h-5 z M2,24 h3 v3 h-3 z" />
      <path d="M9,0 h2 v2 h-2 z M13,0 h1 v1 h-1 z M16,0 h1 v2 h-1 z M19,0 h2 v1 h-2 z" />
      <path d="M9,3 h1 v2 h-1 z M12,3 h3 v1 h-3 z M17,2 h2 v1 h-2 z" />
      <path d="M10,6 h2 v1 h-2 z M14,5 h2 v2 h-2 z M19,5 h1 v3 h-1 z" />
      <path d="M0,9 h2 v1 h-2 z M4,9 h1 v2 h-1 z M8,9 h3 v1 h-3 z M13,9 h2 v2 h-2 z M18,8 h3 v1 h-3 z" />
      <path d="M1,12 h1 v1 h-1 z M5,11 h3 v2 h-3 z M10,12 h1 v2 h-1 z M15,12 h4 v1 h-4 z" />
      <path d="M0,15 h3 v1 h-3 z M6,15 h1 v2 h-1 z M9,15 h3 v1 h-3 z M14,14 h1 v3 h-1 z M18,15 h2 v1 h-2 z" />
      <path d="M3,18 h2 v1 h-2 z M7,18 h1 v1 h-1 z M11,17 h2 v2 h-2 z M15,18 h3 v1 h-3 z" />
      <path d="M9,21 h4 v1 h-4 z M15,20 h2 v3 h-2 z M20,20 h2 v1 h-2 z" />
      <path d="M9,24 h2 v1 h-2 z M13,24 h3 v2 h-3 z M18,23 h1 v3 h-1 z" />
      <path d="M10,27 h1 v1 h-1 z M14,27 h3 v1 h-3 z M19,27 h2 v1 h-2 z" />
      <path d="M22,22 h5 v5 h-5 z M23,23 h3 v3 h-3 z" />
      <path d="M8,14 h11 v1 h-11 z M14,8 h1 v11 h-1 z" />
      <path d="M21,10 h1 v1 h-1 z M24,12 h2 v1 h-2 z M27,11 h1 v2 h-1 z" />
      <path d="M23,15 h3 v1 h-3 z M21,17 h1 v3 h-1 z M25,18 h2 v1 h-2 z M28,16 h1 v3 h-1 z" />
    </svg>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <style dangerouslySetInnerHTML={{ __html: `
            #printable-receipt, #printable-receipt * {
              color: #000000 !important;
              border-color: #000000 !important;
            }
            #printable-receipt .opacity-75 {
              opacity: 0.9 !important;
            }
            #printable-receipt .opacity-40 {
              opacity: 0.75 !important;
            }
            #printable-receipt .border-black/20 {
              border-color: rgba(0, 0, 0, 0.45) !important;
            }
          `}} />
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
            className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold tracking-tight uppercase text-white">Registration Receipt</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 text-white/70 hover:text-white rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Container for Receipt Preview with bottom padding */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col items-center bg-black/20 w-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <div className="w-full flex justify-center py-2 px-1 pb-10">
                {/* High-fidelity thermal paper receipt roll emulation container */}
                <div 
                  id="printable-receipt" 
                  className="w-full max-w-[290px] bg-white text-black p-5 shadow-2xl relative border-t-4 border-black font-mono text-[11px] leading-relaxed select-text shrink-0"
                  style={{ 
                    boxShadow: '0 15px 35px -10px rgba(0,0,0,0.6)',
                    minHeight: '380px'
                  }}
                >
                  {/* Simulated continuous thermal roll edge perforations/notches */}
                  <div className="absolute top-0 bottom-0 -left-1 flex flex-col justify-between py-2 pointer-events-none select-none opacity-[0.15]">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-black rounded-full" />
                    ))}
                  </div>
                  <div className="absolute top-0 bottom-0 -right-1 flex flex-col justify-between py-2 pointer-events-none select-none opacity-[0.15]">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-black rounded-full" />
                    ))}
                  </div>

                  <div className="text-center mb-3">
                    {activeFacilityLogo ? (
                      <img src={activeFacilityLogo} alt="Facility Logo" className="w-12 h-12 object-contain mx-auto mb-1.5 grayscale" />
                    ) : (
                      <HeartPulse className="w-8 h-8 text-black mx-auto mb-1" />
                    )}
                    <p className="font-extrabold text-[12px] uppercase tracking-tight leading-tight px-1">{activeFacilityName}</p>
                    <p className="text-[8.5px] font-bold mt-1 text-black/80 leading-snug">Saint Charles Road (Before Attaesibi Hotel)<br/>Digital Address NT-0061-5616, Tamale, Northern Region, Ghana</p>
                    <p className="text-[8.5px] font-medium text-black/70 mt-0.5">Contact: +233 50 025 2793 / +233 55 058 3106</p>
                  </div>

                  <div className="text-center font-bold border-y border-dashed border-black py-1.5 my-3 uppercase text-[11px] tracking-wide">
                    Registration Receipt
                  </div>

                  <div className="space-y-1 text-[10.5px]">
                    <div className="flex justify-between">
                      <span className="font-bold uppercase">Date:</span>
                      <span className="text-right">{formatDate(new Date())}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold uppercase">Patient ID:</span>
                      <span className="font-bold">{patient.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold uppercase">Name:</span>
                      <span className="font-bold text-right truncate max-w-[140px]">{patient.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold uppercase">Age/Gen:</span>
                      <span>{patient.age} / {patient.gender}</span>
                    </div>
                    {patient.phone && (
                      <div className="flex justify-between">
                        <span className="font-bold uppercase">Contact:</span>
                        <span>{patient.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dashed border-black my-2.5" />

                  <div className="space-y-2">
                    <div className="flex justify-between font-bold text-[10.5px] uppercase border-b border-dashed border-black pb-1">
                      <span>Description</span>
                      <span>Amount</span>
                    </div>
                    {(patient.procedures && patient.procedures.length > 0) ? (
                      patient.procedures.map(p => (
                        <div key={p.name} className="space-y-0.5 text-[10.5px]">
                          <div className="flex justify-between font-bold">
                            <span className="truncate max-w-[160px]">{p.name}</span>
                            <span>{(p as any).currency || 'GHS'} {p.price.toFixed(2)}</span>
                          </div>
                          {p.laterality && p.laterality !== 'None' && (
                            <div className="text-[8.5px] uppercase opacity-75 font-semibold text-left pl-1">
                              Side: {p.laterality}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between text-[10.5px]">
                        <span>{patient.bodyParts || 'General Imaging'}</span>
                        <span className="font-bold">GHS {patient.totalCost?.toFixed(2) || '0.00'}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t-2 border-double border-black my-2.5" />

                  <div className="flex justify-between items-center text-[12px] font-extrabold pb-1">
                    <span>TOTAL PAID</span>
                    <span>GHS {patient.totalCost?.toFixed(2) || '0.00'}</span>
                  </div>



                  <div className="border-t border-dashed border-black/20 pt-3 text-center space-y-1 mt-3">
                    <p className="font-bold text-[10.5px]">Thank you for your trust!</p>
                    <p className="text-[8.5px] opacity-75">HMS RAD - RIS/PACS Platform</p>
                    <p className="text-[8px] opacity-40 font-mono mt-1.5">Ref: {receiptRef}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="p-4 border-t border-white/5 bg-black/40 flex justify-center shrink-0">
              <div className="flex gap-3 w-full max-w-[290px]">
                <button 
                  onClick={onClose}
                  className="flex-1 glass-btn bg-white/5 border-white/10 py-3 font-bold text-white/80 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest text-[10px]"
                >
                  Close
                </button>
                <button 
                  onClick={printReceipt}
                  className="flex-2 glass-btn bg-primary text-black font-bold h-11 flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-[10px]"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
